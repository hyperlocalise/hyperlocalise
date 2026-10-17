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
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import {
  OOXML_LINE_BREAK,
  OoxmlParagraph,
  marshalOoxmlPart,
  normalizeOoxmlSourceRunText,
  ooxmlPartEntries,
  walkOoxmlParagraphs,
  type OoxmlEntry,
} from "./ooxml-paragraph";
import {
  OOXML_NAMESPACE_WORD,
  OoxmlRenderer,
  decodeOoxmlText,
  escapeOoxmlText,
  nodeAttr,
  nodeChild,
  nodeInner,
  nodeIs,
  nodeQualified,
  nodeRaw,
  ooxmlHasPart,
  ooxmlInvalid,
  ooxmlPartNames,
  ooxmlRelationshipTargets,
  openOoxmlPackage,
  parseOoxmlTree,
  readOoxmlPart,
  rewriteOoxmlPackage,
  type OoxmlError,
  type OoxmlNode,
  type OoxmlPackage,
  type OoxmlPart,
} from "./ooxml-tree";

// Mirrors internal/i18n/translationfileparser/docx_parser.go. Paragraphs are read from the
// main document, then headers, footers, footnotes, and endnotes, and keyed by part and
// position among all of the part's paragraphs, for example "word/document.xml#12". Tracked
// deletions are left out and tracked insertions are read as text, so a translated document
// has its tracked changes accepted.

export const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const MAIN_DOCUMENT_PART = "word/document.xml";
const SECONDARY_PART_PATTERN = /^word\/(header|footer)(\d*)\.xml$/;

/** Zero-width marks between runs, kept at the start or end of a translated paragraph. */
const MARKER_LOCALS = new Set([
  "bookmarkStart",
  "bookmarkEnd",
  "commentRangeStart",
  "commentRangeEnd",
  "permStart",
  "permEnd",
  "moveFromRangeStart",
  "moveFromRangeEnd",
  "moveToRangeStart",
  "moveToRangeEnd",
  "customXmlInsRangeStart",
  "customXmlInsRangeEnd",
  "customXmlDelRangeStart",
  "customXmlDelRangeEnd",
  "customXmlMoveFromRangeStart",
  "customXmlMoveFromRangeEnd",
  "customXmlMoveToRangeStart",
  "customXmlMoveToRangeEnd",
]);

type DocxPart = OoxmlPart & { location: string };

async function docxParts(pkg: OoxmlPackage): Promise<Result<DocxPart[], OoxmlError>> {
  let mainName = MAIN_DOCUMENT_PART;
  if (!ooxmlHasPart(pkg, mainName)) {
    const relationships = await ooxmlRelationshipTargets(pkg, "_rels/.rels", "");
    if (isErr(relationships)) return relationships;
    mainName = "";
    for (const [id, type] of relationships.value.types) {
      if (type.endsWith("/officeDocument")) {
        mainName = relationships.value.targets.get(id) ?? "";
      }
    }
  }
  const main = await readOoxmlPart(pkg, mainName);
  if (isErr(main)) return main;
  if (main.value === null) {
    return err(ooxmlInvalid("docx", "package has no main document"));
  }
  const parts: DocxPart[] = [{ name: mainName, content: main.value, location: "Word body" }];

  const others = ooxmlPartNames(pkg)
    .flatMap((name) => {
      const match = SECONDARY_PART_PATTERN.exec(name);
      return match
        ? [
            {
              name,
              rank: match[1] === "header" ? 0 : 1,
              number: Number.parseInt(match[2] || "0", 10),
              location: `Word ${match[1]}`,
            },
          ]
        : [];
    })
    .toSorted(
      (a, b) =>
        a.rank - b.rank || a.number - b.number || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
  for (const notes of [
    { name: "word/footnotes.xml", location: "Word footnote" },
    { name: "word/endnotes.xml", location: "Word endnote" },
  ]) {
    if (ooxmlHasPart(pkg, notes.name)) {
      others.push({ ...notes, rank: 2, number: 0 });
    }
  }
  for (const other of others) {
    const content = await readOoxmlPart(pkg, other.name);
    if (isErr(content)) return content;
    if (content.value !== null) {
      parts.push({ name: other.name, content: content.value, location: other.location });
    }
  }
  return ok(parts);
}

function fieldDepthChange(run: OoxmlNode): number {
  let change = 0;
  for (const child of run.children) {
    if (!nodeIs(child, OOXML_NAMESPACE_WORD, "fldChar")) continue;
    const kind = nodeAttr(child, "fldCharType");
    if (kind === "begin") change++;
    else if (kind === "end") change--;
  }
  return change;
}

function buildDocxParagraph(content: string, paragraph: OoxmlParagraph) {
  let field: OoxmlNode[] = [];
  let fieldDepth = 0;
  const flushField = () => {
    if (field.length > 0) paragraph.addAtom(field, "", false);
    field = [];
    fieldDepth = 0;
  };

  const collectRun = (run: OoxmlNode, link: OoxmlNode | null) => {
    const change = fieldDepthChange(run);
    if (change > 0) {
      field = [run];
      fieldDepth = change;
      return;
    }
    const properties = nodeChild(run, OOXML_NAMESPACE_WORD, "rPr");
    const props = properties ? nodeRaw(content, properties) : "";
    for (const child of run.children) {
      if (child.space !== OOXML_NAMESPACE_WORD) {
        paragraph.addAtom([child], props, true);
        continue;
      }
      switch (child.local) {
        case "rPr":
        case "lastRenderedPageBreak":
        case "delText":
        case "delInstrText":
          break;
        case "t":
          if (!child.selfClosing) {
            paragraph.addText(
              normalizeOoxmlSourceRunText(decodeOoxmlText(nodeInner(content, child))),
              props,
              link,
              false,
            );
          }
          break;
        case "tab":
          paragraph.addText("\t", props, link, false);
          break;
        case "cr":
          paragraph.addText(OOXML_LINE_BREAK, props, link, false);
          break;
        case "br": {
          const kind = nodeAttr(child, "type") ?? "";
          if (kind === "" || kind === "textWrapping") {
            paragraph.addText(OOXML_LINE_BREAK, props, link, false);
          } else {
            paragraph.addAtom([child], props, true);
          }
          break;
        }
        case "noBreakHyphen":
          paragraph.addText("\u2011", props, link, false);
          break;
        case "softHyphen":
          paragraph.addText("\u00AD", props, link, false);
          break;
        default:
          paragraph.addAtom([child], props, true);
      }
    }
  };

  const collect = (node: OoxmlNode, link: OoxmlNode | null) => {
    if (fieldDepth > 0) {
      field.push(node);
      if (nodeIs(node, OOXML_NAMESPACE_WORD, "r")) {
        fieldDepth += fieldDepthChange(node);
        if (fieldDepth <= 0) flushField();
      }
      return;
    }
    if (node.space !== OOXML_NAMESPACE_WORD) {
      paragraph.addAtom([node], "", false);
      return;
    }
    switch (node.local) {
      case "r":
        collectRun(node, link);
        return;
      case "hyperlink":
        if (node.selfClosing) {
          paragraph.addMarker(node);
          return;
        }
        for (const child of node.children) collect(child, node);
        return;
      case "ins":
      case "moveTo":
      case "smartTag":
      case "customXml":
        for (const child of node.children) {
          if (
            nodeIs(child, OOXML_NAMESPACE_WORD, "smartTagPr") ||
            nodeIs(child, OOXML_NAMESPACE_WORD, "customXmlPr")
          ) {
            continue;
          }
          collect(child, link);
        }
        return;
      case "del":
      case "moveFrom":
      case "proofErr":
        return;
      default:
        if (MARKER_LOCALS.has(node.local)) paragraph.addMarker(node);
        else paragraph.addAtom([node], "", false);
    }
  };

  for (const child of paragraph.node.children) {
    if (nodeIs(child, OOXML_NAMESPACE_WORD, "pPr")) {
      paragraph.head.push(child);
      continue;
    }
    collect(child, null);
  }
  flushField();
}

function docxParagraphContext(paragraph: OoxmlParagraph, location: string): string {
  const properties = nodeChild(paragraph.node, OOXML_NAMESPACE_WORD, "pPr");
  const style = properties && nodeChild(properties, OOXML_NAMESPACE_WORD, "pStyle");
  const id = style && nodeAttr(style, "val");
  return id ? `${location}, style ${id}` : location;
}

function scanDocxPart(
  part: DocxPart,
): Result<{ root: OoxmlNode; paragraphs: OoxmlParagraph[] }, OoxmlError> {
  const root = parseOoxmlTree(part.content);
  if (isErr(root)) {
    return err(ooxmlInvalid("docx", `parse ${part.name}: ${root.error}`));
  }
  const locations = [part.location];
  const paragraphs = walkOoxmlParagraphs(root.value, {
    isParagraph: (node) => nodeIs(node, OOXML_NAMESPACE_WORD, "p"),
    enter: (node) => {
      const location = nodeIs(node, OOXML_NAMESPACE_WORD, "tc")
        ? "Word table cell"
        : nodeIs(node, OOXML_NAMESPACE_WORD, "txbxContent")
          ? "Word text box"
          : "";
      if (location === "") return () => {};
      locations.push(location);
      return () => locations.pop();
    },
    build: (paragraph) => {
      buildDocxParagraph(part.content, paragraph);
      paragraph.context = docxParagraphContext(paragraph, locations[locations.length - 1]!);
    },
  });
  return ok({ root: root.value, paragraphs });
}

function writeDocxText(out: string[], paragraph: OoxmlParagraph, props: string, text: string) {
  if (text === "") return;
  const run = nodeQualified(paragraph.node, "r");
  const textTag = nodeQualified(paragraph.node, "t");
  out.push(`<${run}>`, props);
  let pending = "";
  const flush = () => {
    if (pending !== "") {
      out.push(`<${textTag} xml:space="preserve">`, escapeOoxmlText(pending), `</${textTag}>`);
      pending = "";
    }
  };
  for (const char of text) {
    const element =
      char === "\t"
        ? "tab"
        : char === "\n"
          ? "br"
          : char === "\u2011"
            ? "noBreakHyphen"
            : char === "\u00AD"
              ? "softHyphen"
              : "";
    if (element === "") {
      pending += char;
      continue;
    }
    flush();
    out.push(`<${nodeQualified(paragraph.node, element)}/>`);
  }
  flush();
  out.push(`</${run}>`);
}

/** Lists a document's paragraphs with text, in part order. */
export async function readDocxEntries(
  content: Uint8Array,
): Promise<Result<OoxmlEntry[], OoxmlError>> {
  const pkg = await openOoxmlPackage(content, "docx");
  if (isErr(pkg)) return pkg;
  const parts = await docxParts(pkg.value);
  if (isErr(parts)) return parts;
  const entries: OoxmlEntry[] = [];
  for (const part of parts.value) {
    const scanned = scanDocxPart(part);
    if (isErr(scanned)) return scanned;
    entries.push(...ooxmlPartEntries(part.name, scanned.value.paragraphs));
  }
  return ok(entries);
}

/** Changed parts only, keyed by part name; exposed for parity tests with the Go writer. */
export async function marshalDocxParts(
  template: Uint8Array,
  values: Readonly<Record<string, string>>,
): Promise<Result<{ pkg: OoxmlPackage; replacements: Map<string, string> }, OoxmlError>> {
  const pkg = await openOoxmlPackage(template, "docx");
  if (isErr(pkg)) return pkg;
  const parts = await docxParts(pkg.value);
  if (isErr(parts)) return parts;
  const replacements = new Map<string, string>();
  for (const part of parts.value) {
    const scanned = scanDocxPart(part);
    if (isErr(scanned)) return scanned;
    const updated = marshalOoxmlPart({
      renderer: new OoxmlRenderer(part.content, scanned.value.root),
      root: scanned.value.root,
      paragraphs: scanned.value.paragraphs,
      partName: part.name,
      values,
      writeText: writeDocxText,
    });
    if (updated !== null) replacements.set(part.name, updated);
  }
  return ok({ pkg: pkg.value, replacements });
}

/** Writes `values` into a copy of `template`; paragraphs without a value keep their text. */
export async function applyDocxTranslations(
  template: Uint8Array,
  values: Readonly<Record<string, string>>,
): Promise<Result<Uint8Array, OoxmlError>> {
  const marshalled = await marshalDocxParts(template, values);
  if (isErr(marshalled)) return marshalled;
  if (marshalled.value.replacements.size === 0) return ok(template);
  return rewriteOoxmlPackage(marshalled.value.pkg, marshalled.value.replacements);
}
