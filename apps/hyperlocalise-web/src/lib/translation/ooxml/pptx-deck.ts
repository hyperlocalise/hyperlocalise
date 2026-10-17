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
  type OoxmlEntryFilter,
} from "./ooxml-paragraph";
import {
  OOXML_NAMESPACE_DRAWING,
  OoxmlRenderer,
  decodeOoxmlText,
  escapeOoxmlText,
  nodeAttr,
  nodeInner,
  nodeIs,
  nodePrefixedAttr,
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

// Mirrors internal/i18n/translationfileparser/pptx_parser.go. Slides are read in
// presentation order; each paragraph of a shape or table cell is one entry, keyed by its
// slide part and its position among the slide's paragraphs, for example
// "ppt/slides/slide3.xml#4". Notes, layouts, masters, charts, and diagrams are carried over.

export const PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const SLIDE_PART_PATTERN = /^ppt\/slides\/slide(\d+)\.xml$/;

/** Slides in the presentation's slide list order; part numbers follow creation order. */
async function pptxSlideParts(pkg: OoxmlPackage): Promise<Result<OoxmlPart[], OoxmlError>> {
  const presentation = await readOoxmlPart(pkg, "ppt/presentation.xml");
  if (isErr(presentation)) return presentation;
  if (presentation.value === null) {
    return err(ooxmlInvalid("pptx", "package has no presentation part"));
  }
  const relationships = await ooxmlRelationshipTargets(
    pkg,
    "ppt/_rels/presentation.xml.rels",
    "ppt",
  );
  if (isErr(relationships)) return relationships;
  const root = parseOoxmlTree(presentation.value);
  if (isErr(root)) {
    return err(ooxmlInvalid("pptx", `parse presentation: ${root.error}`));
  }
  let names: string[] = [];
  const walk = (node: OoxmlNode) => {
    for (const child of node.children) {
      if (child.local === "sldId") {
        const id = nodePrefixedAttr(child, "id");
        const target = id ? relationships.value.targets.get(id) : undefined;
        if (target && ooxmlHasPart(pkg, target)) names.push(target);
      }
      walk(child);
    }
  };
  walk(root.value);
  if (names.length === 0) {
    names = ooxmlPartNames(pkg)
      .flatMap((name) => {
        const match = SLIDE_PART_PATTERN.exec(name);
        return match ? [{ name, number: Number.parseInt(match[1]!, 10) }] : [];
      })
      .toSorted((a, b) => a.number - b.number)
      .map((slide) => slide.name);
  }
  const parts: OoxmlPart[] = [];
  for (const name of names) {
    const content = await readOoxmlPart(pkg, name);
    if (isErr(content)) return content;
    if (content.value !== null) parts.push({ name, content: content.value });
  }
  return ok(parts);
}

function buildPptxParagraph(content: string, paragraph: OoxmlParagraph) {
  for (const child of paragraph.node.children) {
    if (child.space !== OOXML_NAMESPACE_DRAWING) {
      paragraph.addAtom([child], "", false);
      continue;
    }
    switch (child.local) {
      case "pPr":
        paragraph.head.push(child);
        break;
      case "endParaRPr":
        paragraph.tail.push(child);
        break;
      case "r": {
        let props = "";
        let text = "";
        for (const part of child.children) {
          if (nodeIs(part, OOXML_NAMESPACE_DRAWING, "rPr")) props = nodeRaw(content, part);
          else if (nodeIs(part, OOXML_NAMESPACE_DRAWING, "t"))
            text += decodeOoxmlText(nodeInner(content, part));
        }
        paragraph.addText(normalizeOoxmlSourceRunText(text), props, null, false);
        break;
      }
      case "br":
        paragraph.addText(OOXML_LINE_BREAK, "", null, true);
        break;
      default:
        paragraph.addAtom([child], "", false);
    }
  }
}

function scanPptxSlide(
  slide: OoxmlPart,
  number: number,
): Result<{ root: OoxmlNode; paragraphs: OoxmlParagraph[] }, OoxmlError> {
  const root = parseOoxmlTree(slide.content);
  if (isErr(root)) {
    return err(ooxmlInvalid("pptx", `parse ${slide.name}: ${root.error}`));
  }
  let shapeName = "";
  let tableDepth = 0;
  const paragraphs = walkOoxmlParagraphs(root.value, {
    isParagraph: (node) => nodeIs(node, OOXML_NAMESPACE_DRAWING, "p"),
    enter: (node) => {
      if (node.local === "cNvPr") shapeName = nodeAttr(node, "name") ?? "";
      if (nodeIs(node, OOXML_NAMESPACE_DRAWING, "tbl")) {
        tableDepth++;
        return () => {
          tableDepth--;
        };
      }
      return () => {};
    },
    build: (paragraph) => {
      buildPptxParagraph(slide.content, paragraph);
      paragraph.context = [
        `Slide ${number}`,
        ...(shapeName ? [shapeName] : []),
        ...(tableDepth > 0 ? ["table cell"] : []),
      ].join(", ");
    },
  });
  return ok({ root: root.value, paragraphs });
}

function writePptxText(out: string[], paragraph: OoxmlParagraph, props: string, text: string) {
  const run = nodeQualified(paragraph.node, "r");
  const textTag = nodeQualified(paragraph.node, "t");
  text.split(OOXML_LINE_BREAK).forEach((line, index) => {
    if (index > 0) out.push(`<${nodeQualified(paragraph.node, "br")}/>`);
    if (line === "") return;
    out.push(`<${run}>`, props, `<${textTag}>`, escapeOoxmlText(line), `</${textTag}></${run}>`);
  });
}

/** Lists a deck's paragraphs with text, in slide order. */
export async function readPptxEntries(
  content: Uint8Array,
  include?: OoxmlEntryFilter,
): Promise<Result<OoxmlEntry[], OoxmlError>> {
  const pkg = await openOoxmlPackage(content, "pptx");
  if (isErr(pkg)) return pkg;
  const slides = await pptxSlideParts(pkg.value);
  if (isErr(slides)) return slides;
  const entries: OoxmlEntry[] = [];
  for (const [index, slide] of slides.value.entries()) {
    const scanned = scanPptxSlide(slide, index + 1);
    if (isErr(scanned)) return scanned;
    entries.push(...ooxmlPartEntries(slide.name, scanned.value.paragraphs, include));
  }
  return ok(entries);
}

/** Changed slides only, keyed by part name; exposed for parity tests with the Go writer. */
export async function marshalPptxParts(
  template: Uint8Array,
  values: Readonly<Record<string, string>>,
): Promise<Result<{ pkg: OoxmlPackage; replacements: Map<string, string> }, OoxmlError>> {
  const pkg = await openOoxmlPackage(template, "pptx");
  if (isErr(pkg)) return pkg;
  const slides = await pptxSlideParts(pkg.value);
  if (isErr(slides)) return slides;
  const replacements = new Map<string, string>();
  for (const [index, slide] of slides.value.entries()) {
    const scanned = scanPptxSlide(slide, index + 1);
    if (isErr(scanned)) return scanned;
    const updated = marshalOoxmlPart({
      renderer: new OoxmlRenderer(slide.content, scanned.value.root),
      root: scanned.value.root,
      paragraphs: scanned.value.paragraphs,
      partName: slide.name,
      values,
      writeText: writePptxText,
    });
    if (updated !== null) replacements.set(slide.name, updated);
  }
  return ok({ pkg: pkg.value, replacements });
}

/** Writes `values` into a copy of `template`; paragraphs without a value keep their text. */
export async function applyPptxTranslations(
  template: Uint8Array,
  values: Readonly<Record<string, string>>,
): Promise<Result<Uint8Array, OoxmlError>> {
  const marshalled = await marshalPptxParts(template, values);
  if (isErr(marshalled)) return marshalled;
  if (marshalled.value.replacements.size === 0) return ok(template);
  return rewriteOoxmlPackage(marshalled.value.pkg, marshalled.value.replacements);
}
