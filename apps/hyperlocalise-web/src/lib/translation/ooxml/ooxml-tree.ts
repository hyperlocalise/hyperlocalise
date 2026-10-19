/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import JSZip from "jszip";

import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";

// Mirrors internal/i18n/translationfileparser/ooxml_tree.go. Office Open XML packages
// (.docx, .pptx) are zip archives of XML parts. A part is read into a tree that keeps
// every element's offsets, so a writer regenerates only the paragraphs it translates and
// copies every other character, including prefixes and markup it does not understand.

export const OOXML_NAMESPACE_WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const OOXML_NAMESPACE_DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main";
export const OOXML_NAMESPACE_MARKUP = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const OOXML_NAMESPACE_XML = "http://www.w3.org/XML/1998/namespace";

/** Caps one decompressed part, as the Go parser does, to guard against zip bombs. */
const OOXML_MAX_PART_BYTES = 64 * 1024 * 1024;
const OOXML_MAX_PACKAGE_BYTES = 256 * 1024 * 1024;
const OOXML_MAX_DEPTH = 512;

export type OoxmlFormat = "docx" | "pptx";

export type OoxmlError =
  | { code: "invalid_office_file"; format: OoxmlFormat; message: string }
  | { code: "office_file_too_large"; format: OoxmlFormat };

export type OoxmlAttr = { prefix: string; local: string; value: string };

export type OoxmlNode = {
  prefix: string;
  local: string;
  space: string;
  attrs: OoxmlAttr[];
  start: number;
  startTagEnd: number;
  closeStart: number;
  end: number;
  selfClosing: boolean;
  children: OoxmlNode[];
};

export type OoxmlPart = { name: string; content: string };

export function nodeRaw(content: string, node: OoxmlNode): string {
  return content.slice(node.start, node.end);
}

export function nodeInner(content: string, node: OoxmlNode): string {
  return node.selfClosing ? "" : content.slice(node.startTagEnd, node.closeStart);
}

export function nodeIs(node: OoxmlNode, space: string, local: string): boolean {
  return node.space === space && node.local === local;
}

export function nodeAttr(node: OoxmlNode, local: string): string | undefined {
  return node.attrs.find((attr) => attr.local === local && attr.prefix !== "xmlns")?.value;
}

/** An attribute written with a namespace prefix, such as `r:id`. */
export function nodePrefixedAttr(node: OoxmlNode, local: string): string | undefined {
  return node.attrs.find(
    (attr) => attr.local === local && attr.prefix !== "" && attr.prefix !== "xmlns",
  )?.value;
}

export function nodeChild(node: OoxmlNode, space: string, local: string): OoxmlNode | undefined {
  return node.children.find((child) => nodeIs(child, space, local));
}

export function nodeQualified(node: OoxmlNode, local: string): string {
  return node.prefix === "" ? local : `${node.prefix}:${local}`;
}

function splitName(name: string): { prefix: string; local: string } {
  const colon = name.indexOf(":");
  if (colon >= 1 && colon < name.length - 1) {
    return { prefix: name.slice(0, colon), local: name.slice(colon + 1) };
  }
  return { prefix: "", local: name };
}

const NAME_END = /[\s/>=]/;

class OoxmlSyntaxError extends Error {}

function skipTo(content: string, from: number, terminator: string): number {
  const index = content.indexOf(terminator, from);
  if (index < 0) {
    throw new OoxmlSyntaxError(`unterminated markup at ${from}`);
  }
  return index + terminator.length;
}

function readStartTag(content: string, start: number) {
  let pos = start + 1;
  while (pos < content.length && !NAME_END.test(content[pos]!)) {
    pos++;
  }
  const name = content.slice(start + 1, pos);
  if (name === "") {
    throw new OoxmlSyntaxError(`empty element name at ${start}`);
  }
  const attrs: OoxmlAttr[] = [];
  for (;;) {
    while (pos < content.length && /\s/.test(content[pos]!)) {
      pos++;
    }
    const char = content[pos];
    if (char === undefined) {
      throw new OoxmlSyntaxError(`unterminated start tag at ${start}`);
    }
    if (char === ">") {
      return { name, attrs, end: pos + 1, selfClosing: false };
    }
    if (char === "/" && content[pos + 1] === ">") {
      return { name, attrs, end: pos + 2, selfClosing: true };
    }
    const nameStart = pos;
    while (pos < content.length && !NAME_END.test(content[pos]!)) {
      pos++;
    }
    const attrName = content.slice(nameStart, pos);
    while (pos < content.length && /\s/.test(content[pos]!)) {
      pos++;
    }
    if (attrName === "" || content[pos] !== "=") {
      throw new OoxmlSyntaxError(`malformed attribute at ${nameStart}`);
    }
    pos++;
    while (pos < content.length && /\s/.test(content[pos]!)) {
      pos++;
    }
    const quote = content[pos];
    if (quote !== '"' && quote !== "'") {
      throw new OoxmlSyntaxError(`unquoted attribute at ${pos}`);
    }
    const valueEnd = content.indexOf(quote, pos + 1);
    if (valueEnd < 0) {
      throw new OoxmlSyntaxError(`unterminated attribute at ${pos}`);
    }
    attrs.push({
      ...splitName(attrName),
      value: decodeOoxmlText(content.slice(pos + 1, valueEnd)),
    });
    pos = valueEnd + 1;
  }
}

function skipDoctype(content: string, start: number): number {
  let depth = 0;
  for (let pos = start; pos < content.length; pos++) {
    const char = content[pos];
    if (char === "[") depth++;
    else if (char === "]") depth--;
    else if (char === ">" && depth <= 0) return pos + 1;
  }
  throw new OoxmlSyntaxError(`unterminated doctype at ${start}`);
}

/** Returns a synthetic root whose children are the part's top-level elements. */
export function parseOoxmlTree(content: string): Result<OoxmlNode, string> {
  const root: OoxmlNode = {
    prefix: "",
    local: "",
    space: "",
    attrs: [],
    start: 0,
    startTagEnd: 0,
    closeStart: content.length,
    end: content.length,
    selfClosing: false,
    children: [],
  };
  const stack: OoxmlNode[] = [root];
  const namespaces: Map<string, string>[] = [new Map([["xml", OOXML_NAMESPACE_XML]])];
  try {
    let pos = 0;
    while (pos < content.length) {
      const open = content.indexOf("<", pos);
      if (open < 0) {
        break;
      }
      if (content.startsWith("<?", open)) {
        pos = skipTo(content, open, "?>");
      } else if (content.startsWith("<!--", open)) {
        pos = skipTo(content, open, "-->");
      } else if (content.startsWith("<![CDATA[", open)) {
        pos = skipTo(content, open, "]]>");
      } else if (content.startsWith("<!", open)) {
        pos = skipDoctype(content, open);
      } else if (content.startsWith("</", open)) {
        const end = skipTo(content, open, ">");
        if (stack.length < 2) {
          return err("unbalanced xml");
        }
        const node = stack.pop()!;
        namespaces.pop();
        node.closeStart = open;
        node.end = end;
        pos = end;
      } else {
        const tag = readStartTag(content, open);
        let scope = namespaces[namespaces.length - 1]!;
        let cloned = false;
        for (const attr of tag.attrs) {
          let prefix: string | undefined;
          if (attr.prefix === "xmlns") prefix = attr.local;
          else if (attr.prefix === "" && attr.local === "xmlns") prefix = "";
          if (prefix === undefined) continue;
          if (!cloned) {
            scope = new Map(scope);
            cloned = true;
          }
          scope.set(prefix, attr.value);
        }
        const name = splitName(tag.name);
        const node: OoxmlNode = {
          prefix: name.prefix,
          local: name.local,
          space: scope.get(name.prefix) ?? "",
          attrs: tag.attrs,
          start: open,
          startTagEnd: tag.end,
          closeStart: tag.end,
          end: tag.end,
          selfClosing: tag.selfClosing,
          children: [],
        };
        stack[stack.length - 1]!.children.push(node);
        pos = tag.end;
        if (tag.selfClosing) {
          continue;
        }
        if (stack.length > OOXML_MAX_DEPTH) {
          return err("xml nesting too deep");
        }
        stack.push(node);
        namespaces.push(scope);
      }
    }
  } catch (error) {
    if (error instanceof OoxmlSyntaxError) {
      return err(error.message);
    }
    throw error;
  }
  if (stack.length !== 1) {
    return err("unclosed xml element");
  }
  return ok(root);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntity(entity: string): string | undefined {
  const named = NAMED_ENTITIES[entity];
  if (named !== undefined) {
    return named;
  }
  const hex = entity.startsWith("#x");
  if (!hex && !entity.startsWith("#")) {
    return undefined;
  }
  const digits = entity.slice(hex ? 2 : 1);
  if (digits === "" || !(hex ? /^[0-9a-fA-F]+$/ : /^[0-9]+$/).test(digits)) {
    return undefined;
  }
  const code = Number.parseInt(digits, hex ? 16 : 10);
  return code <= 0x10ffff ? String.fromCodePoint(code) : undefined;
}

export function decodeOoxmlText(raw: string): string {
  if (!raw.includes("&")) {
    return raw;
  }
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!;
    if (char !== "&") {
      out += char;
      continue;
    }
    const semi = raw.indexOf(";", i);
    const decoded = semi < 0 ? undefined : decodeEntity(raw.slice(i + 1, semi));
    if (decoded === undefined) {
      out += char;
      continue;
    }
    out += decoded;
    i = semi;
  }
  return out;
}

export function escapeOoxmlText(text: string): string {
  return text.replace(/[&<>]/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;",
  );
}

/** Writes a part back out, regenerating pending paragraphs and copying everything else. */
export class OoxmlRenderer {
  private readonly pending = new Map<OoxmlNode, (out: string[]) => void>();
  private readonly dirty = new Set<OoxmlNode>();
  private readonly parentOf = new Map<OoxmlNode, OoxmlNode>();

  constructor(
    readonly content: string,
    root: OoxmlNode,
  ) {
    const index = (node: OoxmlNode) => {
      for (const child of node.children) {
        this.parentOf.set(child, node);
        index(child);
      }
    };
    index(root);
  }

  replace(node: OoxmlNode, write: (out: string[]) => void) {
    this.pending.set(node, write);
    for (
      let parent = this.parentOf.get(node);
      parent && !this.dirty.has(parent);
      parent = this.parentOf.get(parent)
    ) {
      this.dirty.add(parent);
    }
  }

  slice(start: number, end: number): string {
    return this.content.slice(start, end);
  }

  render(out: string[], node: OoxmlNode) {
    const write = this.pending.get(node);
    if (write) {
      write(out);
      return;
    }
    if (!this.dirty.has(node)) {
      out.push(this.content.slice(node.start, node.end));
      return;
    }
    let pos = node.start;
    for (const child of node.children) {
      out.push(this.content.slice(pos, child.start));
      this.render(out, child);
      pos = child.end;
    }
    out.push(this.content.slice(pos, node.end));
  }
}

function zipEntryUncompressedSize(file: JSZip.JSZipObject): number {
  const data = (file as { _data?: { uncompressedSize?: number } })._data;
  return typeof data?.uncompressedSize === "number" && data.uncompressedSize >= 0
    ? data.uncompressedSize
    : 0;
}

const UTF8_DECODER = new TextDecoder("utf-8", { ignoreBOM: true });

export type OoxmlPackage = {
  format: OoxmlFormat;
  zip: JSZip;
};

export function ooxmlInvalid(format: OoxmlFormat, message: string): OoxmlError {
  return { code: "invalid_office_file", format, message };
}

export async function openOoxmlPackage(
  content: Uint8Array,
  format: OoxmlFormat,
): Promise<Result<OoxmlPackage, OoxmlError>> {
  const zip = await fromThrowableAsync(JSZip.loadAsync(content));
  if (isErr(zip)) {
    return err(ooxmlInvalid(format, "open package"));
  }
  let total = 0;
  for (const file of Object.values(zip.value.files)) {
    const size = zipEntryUncompressedSize(file);
    total += size;
    if (size > OOXML_MAX_PART_BYTES || total > OOXML_MAX_PACKAGE_BYTES) {
      return err({ code: "office_file_too_large", format });
    }
  }
  return ok({ format, zip: zip.value });
}

export function ooxmlHasPart(pkg: OoxmlPackage, name: string): boolean {
  const file = pkg.zip.files[name];
  return Boolean(file && !file.dir);
}

export function ooxmlPartNames(pkg: OoxmlPackage): string[] {
  return Object.values(pkg.zip.files)
    .filter((file) => !file.dir)
    .map((file) => file.name);
}

export async function readOoxmlPart(
  pkg: OoxmlPackage,
  name: string,
): Promise<Result<string | null, OoxmlError>> {
  const file = pkg.zip.files[name];
  if (!file || file.dir) {
    return ok(null);
  }
  const bytes = await fromThrowableAsync(file.async("uint8array"));
  if (isErr(bytes)) {
    return err(ooxmlInvalid(pkg.format, `read ${name}`));
  }
  if (bytes.value.byteLength > OOXML_MAX_PART_BYTES) {
    return err({ code: "office_file_too_large", format: pkg.format });
  }
  return ok(UTF8_DECODER.decode(bytes.value));
}

export function resolveOoxmlPartName(dir: string, target: string): string {
  if (target.startsWith("/")) {
    return target.slice(1);
  }
  const segments = dir.split("/").filter((segment) => segment !== "");
  for (const segment of target.split("/")) {
    if (segment === "..") segments.pop();
    else if (segment !== "" && segment !== ".") segments.push(segment);
  }
  return segments.join("/");
}

/** Maps relationship ids to part names resolved against `dir`, skipping external targets. */
export async function ooxmlRelationshipTargets(
  pkg: OoxmlPackage,
  relsName: string,
  dir: string,
): Promise<Result<{ targets: Map<string, string>; types: Map<string, string> }, OoxmlError>> {
  const targets = new Map<string, string>();
  const types = new Map<string, string>();
  const content = await readOoxmlPart(pkg, relsName);
  if (isErr(content) || content.value === null) {
    return isErr(content) ? content : ok({ targets, types });
  }
  const root = parseOoxmlTree(content.value);
  if (isErr(root)) {
    return err(ooxmlInvalid(pkg.format, `parse ${relsName}: ${root.error}`));
  }
  const walk = (node: OoxmlNode) => {
    for (const child of node.children) {
      if (child.local === "Relationship") {
        const id = nodeAttr(child, "Id") ?? "";
        const target = nodeAttr(child, "Target") ?? "";
        if (id !== "" && target !== "" && nodeAttr(child, "TargetMode") !== "External") {
          targets.set(id, resolveOoxmlPartName(dir, target));
          types.set(id, nodeAttr(child, "Type") ?? "");
        }
      }
      walk(child);
    }
  };
  walk(root.value);
  return ok({ targets, types });
}

/** Replaces the named parts, keeping their timestamps so the same input gives the same bytes. */
export async function rewriteOoxmlPackage(
  pkg: OoxmlPackage,
  replacements: ReadonlyMap<string, string>,
): Promise<Result<Uint8Array, OoxmlError>> {
  for (const [name, content] of replacements) {
    const file = pkg.zip.files[name];
    pkg.zip.file(name, content, { date: file?.date, createFolders: false });
  }
  const generated = await fromThrowableAsync(
    pkg.zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
  );
  return isErr(generated) ? err(ooxmlInvalid(pkg.format, "finalize package")) : ok(generated.value);
}
