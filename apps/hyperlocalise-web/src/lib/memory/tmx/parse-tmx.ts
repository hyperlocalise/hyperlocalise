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
import { err, ok, type Result } from "@/lib/primitives/result/results";

import {
  TMX_DEFAULT_MAX_UNITS,
  TMX_MAX_SEGMENT_CHARS,
  TMX_SUPPORTED_ENCODINGS,
  TMX_UNSUPPORTED_ELEMENTS,
} from "./tmx-constants";
import type {
  TmxDocument,
  TmxFatalError,
  TmxHeader,
  TmxIssue,
  TmxProperty,
  TmxUnit,
  TmxVariant,
} from "./tmx-types";

const NAME_START = /[A-Za-z:_]/;
const NAME_CHAR = /[A-Za-z0-9:_.-]/;

type StartTag = {
  name: string;
  localName: string;
  attrs: Record<string, string>;
  selfClosing: boolean;
};

class XmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlParseError";
  }
}

class XmlReader {
  readonly xml: string;
  index = 0;

  constructor(xml: string) {
    this.xml = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  }

  get remaining() {
    return this.xml.length - this.index;
  }

  eof() {
    return this.index >= this.xml.length;
  }

  peek() {
    return this.xml[this.index] ?? "";
  }

  startsWith(value: string) {
    return this.xml.startsWith(value, this.index);
  }

  startsWithInsensitive(value: string) {
    return (
      this.xml.slice(this.index, this.index + value.length).toLowerCase() === value.toLowerCase()
    );
  }

  skipWhitespace() {
    while (!this.eof() && /\s/.test(this.peek())) {
      this.index += 1;
    }
  }

  advance(count = 1) {
    this.index += count;
  }

  expect(value: string) {
    if (!this.startsWith(value)) {
      throw new XmlParseError(`expected "${value}"`);
    }
    this.advance(value.length);
  }

  readUntil(needle: string) {
    const start = this.index;
    const found = this.xml.indexOf(needle, this.index);
    if (found === -1) {
      throw new XmlParseError(`unterminated "${needle}"`);
    }
    this.index = found + needle.length;
    return this.xml.slice(start, found);
  }

  readName() {
    if (!NAME_START.test(this.peek())) {
      throw new XmlParseError("expected a name");
    }
    const start = this.index;
    this.advance();
    while (!this.eof() && NAME_CHAR.test(this.peek())) {
      this.advance();
    }
    return this.xml.slice(start, this.index);
  }

  readDeclaration(): { version?: string; encoding?: string } {
    this.expect("<?xml");
    const body = this.readUntil("?>");
    const version = /version\s*=\s*["']([^"']+)["']/i.exec(body)?.[1];
    const encoding = /encoding\s*=\s*["']([^"']+)["']/i.exec(body)?.[1];
    return { version, encoding };
  }

  skipProcessingInstruction() {
    this.expect("<?");
    this.readUntil("?>");
  }

  skipComment() {
    this.expect("<!--");
    this.readUntil("-->");
  }

  readCdata() {
    this.expect("<![CDATA[");
    return this.readUntil("]]>");
  }

  readDoctype() {
    this.expect("<!");
    return this.readUntil(">");
  }

  readQuotedValue() {
    const quote = this.peek();
    if (quote !== '"' && quote !== "'") {
      throw new XmlParseError("expected a quoted attribute value");
    }
    this.advance();
    const start = this.index;
    const end = this.xml.indexOf(quote, this.index);
    if (end === -1) {
      throw new XmlParseError("unterminated attribute value");
    }
    this.index = end + 1;
    return decodeXmlEntities(this.xml.slice(start, end));
  }

  readStartTag(): StartTag {
    this.expect("<");
    const name = this.readName();
    const attrs: Record<string, string> = {};
    this.skipWhitespace();
    while (!this.eof() && this.peek() !== ">" && !this.startsWith("/>")) {
      const attrName = this.readName();
      this.skipWhitespace();
      this.expect("=");
      this.skipWhitespace();
      attrs[attrName] = this.readQuotedValue();
      this.skipWhitespace();
    }
    const selfClosing = this.startsWith("/>");
    if (selfClosing) {
      this.advance(2);
    } else {
      this.expect(">");
    }
    return {
      name,
      localName: localName(name),
      attrs,
      selfClosing,
    };
  }

  readEndTag() {
    this.expect("</");
    const name = this.readName();
    this.skipWhitespace();
    this.expect(">");
    return { name, localName: localName(name) };
  }

  readText() {
    const start = this.index;
    const next = this.xml.indexOf("<", this.index);
    this.index = next === -1 ? this.xml.length : next;
    return decodeXmlEntities(this.xml.slice(start, this.index));
  }

  skipElement(start: StartTag) {
    if (start.selfClosing) {
      return;
    }
    let depth = 1;
    while (!this.eof() && depth > 0) {
      if (this.startsWith("<!--")) {
        this.skipComment();
        continue;
      }
      if (this.startsWith("<![CDATA[")) {
        this.readCdata();
        continue;
      }
      if (this.startsWith("</")) {
        this.readEndTag();
        depth -= 1;
        continue;
      }
      if (this.startsWith("<")) {
        const child = this.readStartTag();
        if (!child.selfClosing) {
          depth += 1;
        }
        continue;
      }
      this.readText();
    }
    if (depth !== 0) {
      throw new XmlParseError(`unclosed <${start.name}>`);
    }
  }
}

function localName(name: string) {
  const separator = name.lastIndexOf(":");
  return (separator === -1 ? name : name.slice(separator + 1)).toLowerCase();
}

function decodeXmlEntities(value: string) {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9._-]*);/g,
    (match, entity: string) => {
      if (entity === "amp") return "&";
      if (entity === "lt") return "<";
      if (entity === "gt") return ">";
      if (entity === "quot") return '"';
      if (entity === "apos") return "'";
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        const codePoint = Number.parseInt(entity.slice(2), 16);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
      }
      if (entity.startsWith("#")) {
        const codePoint = Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
      }
      return match;
    },
  );
}

function attr(attrs: Record<string, string>, name: string) {
  if (attrs[name] !== undefined) {
    return attrs[name];
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(attrs)) {
    if (key.toLowerCase() === wanted || localName(key) === wanted) {
      return value;
    }
  }
  return undefined;
}

function languageAttr(attrs: Record<string, string>) {
  return attr(attrs, "xml:lang") ?? attr(attrs, "lang");
}

function serializeStartTag(tag: StartTag) {
  const attributes = Object.entries(tag.attrs)
    .map(([name, value]) => ` ${name}="${escapeXmlAttr(value)}"`)
    .join("");
  return `<${tag.name}${attributes}${tag.selfClosing ? "/>" : ">"}`;
}

function escapeXmlAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function readElementText(reader: XmlReader, start: StartTag) {
  if (start.selfClosing) {
    return "";
  }
  let text = "";
  while (!reader.eof()) {
    if (reader.startsWith("<!--")) {
      reader.skipComment();
      continue;
    }
    if (reader.startsWith("<![CDATA[")) {
      text += reader.readCdata();
      continue;
    }
    if (reader.startsWith("</")) {
      const end = reader.readEndTag();
      if (end.localName !== start.localName) {
        throw new XmlParseError(`expected </${start.name}>`);
      }
      return text;
    }
    if (reader.startsWith("<")) {
      reader.skipElement(reader.readStartTag());
      continue;
    }
    text += reader.readText();
  }
  throw new XmlParseError(`unclosed <${start.name}>`);
}

function readSegContent(reader: XmlReader, start: StartTag) {
  if (start.selfClosing) {
    return "";
  }
  let content = "";
  let depth = 1;
  while (!reader.eof() && depth > 0) {
    if (reader.startsWith("<!--")) {
      reader.skipComment();
      continue;
    }
    if (reader.startsWith("<![CDATA[")) {
      content += reader.readCdata();
      continue;
    }
    if (reader.startsWith("</")) {
      const end = reader.readEndTag();
      depth -= 1;
      if (depth > 0) {
        content += `</${end.name}>`;
      } else if (end.localName !== "seg") {
        throw new XmlParseError("expected </seg>");
      }
      continue;
    }
    if (reader.startsWith("<")) {
      const child = reader.readStartTag();
      content += serializeStartTag(child);
      if (!child.selfClosing) {
        depth += 1;
      }
      continue;
    }
    content += reader.readText();
  }
  if (depth !== 0) {
    throw new XmlParseError("unclosed <seg>");
  }
  return content;
}

function readPropertiesAndNotes(
  reader: XmlReader,
  start: StartTag,
  onChild: (child: StartTag) => boolean,
) {
  const properties: TmxProperty[] = [];
  const notes: string[] = [];
  const skipped: string[] = [];
  if (start.selfClosing) {
    return { properties, notes, skipped };
  }
  while (!reader.eof()) {
    reader.skipWhitespace();
    if (reader.startsWith("<!--")) {
      reader.skipComment();
      continue;
    }
    if (reader.startsWith("<![CDATA[")) {
      reader.readCdata();
      continue;
    }
    if (reader.startsWith("</")) {
      const end = reader.readEndTag();
      if (end.localName !== start.localName) {
        throw new XmlParseError(`expected </${start.name}>`);
      }
      return { properties, notes, skipped };
    }
    if (!reader.startsWith("<")) {
      reader.readText();
      continue;
    }
    const child = reader.readStartTag();
    if (child.localName === "prop") {
      const type = attr(child.attrs, "type")?.trim() ?? "";
      properties.push({ type, value: readElementText(reader, child) });
      continue;
    }
    if (child.localName === "note") {
      notes.push(readElementText(reader, child));
      continue;
    }
    if (onChild(child)) {
      continue;
    }
    skipped.push(child.localName);
    reader.skipElement(child);
  }
  throw new XmlParseError(`unclosed <${start.name}>`);
}

function parseHeader(reader: XmlReader, start: StartTag): TmxHeader {
  const { properties, notes } = readPropertiesAndNotes(reader, start, () => false);
  return {
    srclang: attr(start.attrs, "srclang"),
    adminlang: attr(start.attrs, "adminlang"),
    creationtool: attr(start.attrs, "creationtool"),
    creationtoolversion: attr(start.attrs, "creationtoolversion"),
    segtype: attr(start.attrs, "segtype"),
    oTmf: attr(start.attrs, "o-tmf"),
    datatype: attr(start.attrs, "datatype"),
    creationdate: attr(start.attrs, "creationdate"),
    creationid: attr(start.attrs, "creationid"),
    changedate: attr(start.attrs, "changedate"),
    changeid: attr(start.attrs, "changeid"),
    properties,
    notes,
  };
}

function parseVariant(reader: XmlReader, start: StartTag): TmxVariant {
  let segment = "";
  const { properties, notes } = readPropertiesAndNotes(reader, start, (child) => {
    if (child.localName === "seg") {
      segment = readSegContent(reader, child);
      return true;
    }
    return false;
  });
  return {
    language: languageAttr(start.attrs)?.trim() ?? "",
    segment,
    properties,
    notes,
    creationdate: attr(start.attrs, "creationdate"),
    changedate: attr(start.attrs, "changedate"),
    creationid: attr(start.attrs, "creationid"),
    changeid: attr(start.attrs, "changeid"),
  };
}

function parseUnit(reader: XmlReader, start: StartTag, unitIndex: number): TmxUnit {
  const variants: TmxVariant[] = [];
  const { properties, notes } = readPropertiesAndNotes(reader, start, (child) => {
    if (child.localName === "tuv") {
      variants.push(parseVariant(reader, child));
      return true;
    }
    return false;
  });
  return {
    unitIndex,
    tuid: attr(start.attrs, "tuid")?.trim() || undefined,
    srclang: attr(start.attrs, "srclang")?.trim() || undefined,
    creationdate: attr(start.attrs, "creationdate"),
    changedate: attr(start.attrs, "changedate"),
    creationid: attr(start.attrs, "creationid"),
    changeid: attr(start.attrs, "changeid"),
    properties,
    notes,
    variants,
  };
}

export type ParseTmxOptions = {
  maxUnits?: number;
  maxSegmentChars?: number;
};

export function parseTmxDocument(
  xml: string,
  options: ParseTmxOptions = {},
): Result<TmxDocument, TmxFatalError> {
  const maxUnits = options.maxUnits ?? TMX_DEFAULT_MAX_UNITS;
  const maxSegmentChars = options.maxSegmentChars ?? TMX_MAX_SEGMENT_CHARS;
  if (xml.length === 0) {
    return err({ code: "empty_tmx", message: "TMX content is empty" });
  }

  const reader = new XmlReader(xml);
  const issues: TmxIssue[] = [];
  let encoding: string | undefined;
  let version: string | undefined;
  let header: TmxHeader = { properties: [], notes: [] };
  const units: TmxUnit[] = [];
  let totalUnits = 0;

  try {
    reader.skipWhitespace();
    if (reader.startsWith("<?xml")) {
      const declaration = reader.readDeclaration();
      encoding = declaration.encoding;
      if (encoding && !TMX_SUPPORTED_ENCODINGS.has(encoding.trim().toLowerCase())) {
        return err({
          code: "unsupported_encoding",
          message: `Unsupported TMX encoding "${encoding}". Use UTF-8.`,
        });
      }
    }

    while (!reader.eof()) {
      reader.skipWhitespace();
      if (reader.eof()) {
        break;
      }
      if (reader.startsWith("<!--")) {
        reader.skipComment();
        continue;
      }
      if (reader.startsWith("<?")) {
        reader.skipProcessingInstruction();
        continue;
      }
      if (reader.startsWithInsensitive("<!DOCTYPE") || reader.startsWith("<!ENTITY")) {
        return err({
          code: "doctype_forbidden",
          message: "TMX documents may not include a DTD or entity declarations",
        });
      }
      if (reader.startsWith("<!")) {
        reader.readDoctype();
        continue;
      }
      if (!reader.startsWith("<")) {
        reader.readText();
        continue;
      }
      const root = reader.readStartTag();
      if (root.localName !== "tmx") {
        throw new XmlParseError("root element must be <tmx>");
      }
      version = attr(root.attrs, "version");
      if (version && !version.startsWith("1.")) {
        issues.push({
          severity: "warning",
          code: "unsupported_tmx_version",
          message: `TMX version "${version}" is not 1.4-compatible; parsing will continue`,
        });
      }
      if (root.selfClosing) {
        break;
      }
      while (!reader.eof()) {
        reader.skipWhitespace();
        if (reader.startsWith("<!--")) {
          reader.skipComment();
          continue;
        }
        if (reader.startsWith("</")) {
          reader.readEndTag();
          break;
        }
        if (!reader.startsWith("<")) {
          reader.readText();
          continue;
        }
        const child = reader.readStartTag();
        if (child.localName === "header") {
          header = parseHeader(reader, child);
          continue;
        }
        if (child.localName === "body") {
          if (child.selfClosing) {
            continue;
          }
          while (!reader.eof()) {
            reader.skipWhitespace();
            if (reader.startsWith("<!--")) {
              reader.skipComment();
              continue;
            }
            if (reader.startsWith("</")) {
              reader.readEndTag();
              break;
            }
            if (!reader.startsWith("<")) {
              reader.readText();
              continue;
            }
            const unitStart = reader.readStartTag();
            if (unitStart.localName !== "tu") {
              if (
                TMX_UNSUPPORTED_ELEMENTS.includes(
                  unitStart.localName as (typeof TMX_UNSUPPORTED_ELEMENTS)[number],
                )
              ) {
                issues.push({
                  severity: "warning",
                  code: "unsupported_element",
                  message: `<${unitStart.localName}> is not imported`,
                });
              }
              reader.skipElement(unitStart);
              continue;
            }
            totalUnits += 1;
            if (totalUnits > maxUnits) {
              return err({
                code: "unit_limit_exceeded",
                message: `TMX contains more than ${maxUnits} translation units. Split the file or raise the documented limit.`,
                unitCount: totalUnits,
                maxUnits,
              });
            }
            const unit = parseUnit(reader, unitStart, totalUnits);
            const oversized = unit.variants.some(
              (variant) => variant.segment.length > maxSegmentChars,
            );
            if (oversized) {
              issues.push({
                severity: "error",
                code: "oversized_segment",
                message: `A segment exceeded the ${maxSegmentChars} character limit`,
                unitIndex: unit.unitIndex,
                tuid: unit.tuid,
              });
              continue;
            }
            units.push(unit);
          }
          continue;
        }
        reader.skipElement(child);
      }
    }
  } catch (error) {
    const message = error instanceof XmlParseError ? error.message : "Malformed TMX XML";
    return err({ code: "malformed_xml", message: `Malformed TMX: ${message}` });
  }

  if (totalUnits === 0 && units.length === 0) {
    return err({ code: "empty_tmx", message: "TMX contains no translation units" });
  }

  return ok({
    version,
    encoding,
    header,
    units,
    issues,
    totalUnits,
  });
}
