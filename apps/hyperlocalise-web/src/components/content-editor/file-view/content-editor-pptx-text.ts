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

/** One slide paragraph with visible text, addressed by its slide part and position. */
export type PptxTextUnit = { id: string; text: string };

/** The paragraphs of one slide, in the order they appear in the slide part. */
export type PptxSlideText = { partName: string; units: PptxTextUnit[] };

export type PptxTextError =
  | { code: "invalid_pptx" }
  | { code: "pptx_part_too_large"; partName: string };

/** Bounds decompressed XML per part, matching the dotLottie archive cap. */
const PPTX_MAX_PART_BYTES = 64 * 1024 * 1024;
const PPTX_PRESENTATION_PART = "ppt/presentation.xml";
const PPTX_PRESENTATION_RELS_PART = "ppt/_rels/presentation.xml.rels";
const PPTX_PRESENTATION_DIRECTORY = "ppt";
const PPTX_SLIDE_PART_PATTERN = /^ppt\/slides\/slide(\d+)\.xml$/;
const PPTX_SLIDE_ID_TAG = "p:sldId";
const PPTX_RELATIONSHIP_TAG = "Relationship";
const PPTX_PARAGRAPH_TAG = "a:p";
const PPTX_RUN_TAG = "a:r";
const PPTX_RUN_PROPERTIES_TAG = "a:rPr";
const PPTX_TEXT_TAG = "a:t";
const PPTX_BREAK_TAG = "a:br";
const PPTX_HYPERLINK_TAG = "a:hlinkClick";
/** Fallback copies for older PowerPoint versions repeat the primary content. */
const PPTX_FALLBACK_TAG = "mc:Fallback";
const PPTX_LINE_BREAK = "\n";

// Quoted attribute values may contain `>`, so they are matched as a whole.
const XML_TAG_PATTERN = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
const XML_ENTITY_PATTERN = /&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g;
const XML_NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
const TAB_CODE = 0x09;
const LINE_FEED_CODE = 0x0a;
const SPACE_CODE = 0x20;
/** Line separators other than a line feed: vertical tab, carriage return, and U+2028. */
const OTHER_LINE_BREAK_CODES: ReadonlySet<number> = new Set([0x0b, 0x0d, 0x2028]);
/** Code points above the control range that XML 1.0 still excludes. */
const XML_NONCHARACTER_CODES: ReadonlySet<number> = new Set([0xfffe, 0xffff]);
const RELATIONSHIP_ID_ATTRIBUTE_PATTERN = /(?:^|\s)Id\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const RELATIONSHIP_TARGET_ATTRIBUTE_PATTERN = /(?:^|\s)Target\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const SLIDE_RELATIONSHIP_ATTRIBUTE_PATTERN = /(?:^|\s)r:id\s*=\s*(?:"([^"]*)"|'([^']*)')/;

type RunNode = {
  kind: "run";
  start: number;
  end: number;
  /** The run's `a:rPr` element as written, or an empty string. */
  properties: string;
  text: string;
  isLink: boolean;
};
type BreakNode = { kind: "break"; start: number; end: number };
type ParagraphNode = RunNode | BreakNode;
type Paragraph = { index: number; nodes: ParagraphNode[] };

function decodeXmlText(value: string): string {
  return value.replace(XML_ENTITY_PATTERN, (match, decimal, hex, named) => {
    if (named) {
      return XML_NAMED_ENTITIES[named] ?? match;
    }
    const codePoint = Number.parseInt(decimal ?? hex, decimal ? 10 : 16);
    return Number.isFinite(codePoint) && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : match;
  });
}

function encodeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function attributeValue(attributes: string, pattern: RegExp): string | null {
  const match = pattern.exec(attributes);
  return match ? decodeXmlText(match[1] ?? match[2] ?? "") : null;
}

/**
 * Walks every tag once and collects, per paragraph, the runs and line breaks that are its
 * direct children. Matching on whole tag names keeps table markup such as `a:tbl` and `a:tc`
 * out of the text, and fields such as slide numbers are not runs, so they are left alone.
 */
function scanParagraphs(xml: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let paragraphCount = 0;
  let depth = 0;
  let fallbackDepth = 0;
  let paragraph: (Paragraph & { depth: number }) | null = null;
  let run: Omit<RunNode, "end"> | null = null;
  let breakStart: number | null = null;
  let propertiesStart: number | null = null;
  let textStart: number | null = null;

  XML_TAG_PATTERN.lastIndex = 0;
  for (let match = XML_TAG_PATTERN.exec(xml); match; match = XML_TAG_PATTERN.exec(xml)) {
    const [raw, closing, name, , selfClosing] = match;
    const start = match.index;
    const end = start + raw.length;
    const isClose = closing === "/";
    const isSelfClosing = selfClosing === "/";
    if (isClose) {
      depth -= 1;
    }
    const elementDepth = depth;
    if (!isClose && !isSelfClosing) {
      depth += 1;
    }

    if (name === PPTX_FALLBACK_TAG) {
      if (!isSelfClosing) {
        fallbackDepth += isClose ? -1 : 1;
      }
      continue;
    }

    if (name === PPTX_PARAGRAPH_TAG) {
      if (isClose) {
        if (paragraph && elementDepth === paragraph.depth) {
          paragraphs.push({ index: paragraph.index, nodes: paragraph.nodes });
          paragraph = null;
          run = null;
        }
      } else {
        // Every paragraph is counted, so a unit id stays valid whatever is skipped.
        const index = paragraphCount;
        paragraphCount += 1;
        if (!isSelfClosing && !paragraph && fallbackDepth === 0) {
          paragraph = { index, depth: elementDepth, nodes: [] };
          breakStart = null;
          propertiesStart = null;
          textStart = null;
        }
      }
      continue;
    }

    if (!paragraph) {
      continue;
    }
    const childDepth = elementDepth - paragraph.depth;

    if (name === PPTX_RUN_TAG && childDepth === 1) {
      if (isClose) {
        if (run) {
          paragraph.nodes.push({ ...run, end });
          run = null;
        }
      } else if (!isSelfClosing) {
        run = { kind: "run", start, properties: "", text: "", isLink: false };
      }
    } else if (name === PPTX_BREAK_TAG && childDepth === 1) {
      if (isSelfClosing) {
        paragraph.nodes.push({ kind: "break", start, end });
      } else if (!isClose) {
        breakStart = start;
      } else if (breakStart !== null) {
        paragraph.nodes.push({ kind: "break", start: breakStart, end });
        breakStart = null;
      }
    } else if (run) {
      if (name === PPTX_RUN_PROPERTIES_TAG && childDepth === 2) {
        if (isSelfClosing) {
          run.properties = raw;
        } else if (!isClose) {
          propertiesStart = start;
        } else if (propertiesStart !== null) {
          run.properties = xml.slice(propertiesStart, end);
          propertiesStart = null;
        }
      } else if (name === PPTX_TEXT_TAG && childDepth === 2) {
        if (isClose && textStart !== null) {
          run.text += decodeXmlText(xml.slice(textStart, start));
          textStart = null;
        } else if (!isClose && !isSelfClosing) {
          textStart = end;
        }
      } else if (name === PPTX_HYPERLINK_TAG) {
        run.isLink = true;
      }
    }
  }

  return paragraphs;
}

/** A line break inside a paragraph is a new line; raw line breaks inside a run are spaces. */
function paragraphText(paragraph: Paragraph): string {
  return paragraph.nodes
    .map((node) => (node.kind === "break" ? PPTX_LINE_BREAK : node.text.replace(/[\r\n]+/g, " ")))
    .join("");
}

function unitId(partName: string, paragraphIndex: number): string {
  return `${partName}#${paragraphIndex}`;
}

function zipEntryUncompressedSize(file: JSZip.JSZipObject): number | null {
  const data = (file as { _data?: { uncompressedSize?: number } })._data;
  return data && typeof data.uncompressedSize === "number" ? data.uncompressedSize : null;
}

async function readPart(zip: JSZip, name: string): Promise<Result<string | null, PptxTextError>> {
  const file = zip.files[name];
  if (!file || file.dir) {
    return ok(null);
  }
  if ((zipEntryUncompressedSize(file) ?? 0) > PPTX_MAX_PART_BYTES) {
    return err({ code: "pptx_part_too_large", partName: name });
  }
  const xml = await fromThrowableAsync(file.async("string"));
  if (isErr(xml)) {
    return err({ code: "invalid_pptx" });
  }
  if (xml.value.length > PPTX_MAX_PART_BYTES) {
    return err({ code: "pptx_part_too_large", partName: name });
  }
  return ok(xml.value);
}

function resolvePartName(directory: string, target: string): string {
  if (target.startsWith("/")) {
    return target.slice(1);
  }
  const segments = directory.split("/").filter(Boolean);
  for (const segment of target.split("/")) {
    if (segment === "..") {
      segments.pop();
    } else if (segment !== "" && segment !== ".") {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

function matchTags(xml: string, tagName: string): string[] {
  const attributes: string[] = [];
  XML_TAG_PATTERN.lastIndex = 0;
  for (let match = XML_TAG_PATTERN.exec(xml); match; match = XML_TAG_PATTERN.exec(xml)) {
    if (match[1] !== "/" && match[2] === tagName) {
      attributes.push(match[3] ?? "");
    }
  }
  return attributes;
}

/**
 * Slides in presentation order. Part names follow creation order, so a reordered deck is
 * read through the slide list; packages without a usable list fall back to part numbers.
 */
function slidePartNames(zip: JSZip, presentationXml: string, relationshipsXml: string): string[] {
  const targets = new Map<string, string>();
  for (const attributes of matchTags(relationshipsXml, PPTX_RELATIONSHIP_TAG)) {
    const id = attributeValue(attributes, RELATIONSHIP_ID_ATTRIBUTE_PATTERN);
    const target = attributeValue(attributes, RELATIONSHIP_TARGET_ATTRIBUTE_PATTERN);
    if (id && target) {
      targets.set(id, resolvePartName(PPTX_PRESENTATION_DIRECTORY, target));
    }
  }

  const listed = matchTags(presentationXml, PPTX_SLIDE_ID_TAG).flatMap((attributes) => {
    const target = targets.get(
      attributeValue(attributes, SLIDE_RELATIONSHIP_ATTRIBUTE_PATTERN) ?? "",
    );
    return target && zip.files[target] ? [target] : [];
  });
  if (listed.length > 0) {
    return listed;
  }

  return Object.keys(zip.files)
    .filter((name) => PPTX_SLIDE_PART_PATTERN.test(name))
    .toSorted(
      (left, right) =>
        Number(PPTX_SLIDE_PART_PATTERN.exec(left)?.[1]) -
        Number(PPTX_SLIDE_PART_PATTERN.exec(right)?.[1]),
    );
}

type PptxSlidePart = { name: string; xml: string };

async function loadSlideParts(
  content: Uint8Array | ArrayBuffer,
): Promise<Result<{ zip: JSZip; parts: PptxSlidePart[] }, PptxTextError>> {
  const loaded = await fromThrowableAsync(JSZip.loadAsync(content));
  if (isErr(loaded)) {
    return err({ code: "invalid_pptx" });
  }
  const zip = loaded.value;

  const presentation = await readPart(zip, PPTX_PRESENTATION_PART);
  if (isErr(presentation)) {
    return err(presentation.error);
  }
  if (presentation.value === null) {
    return err({ code: "invalid_pptx" });
  }
  const relationships = await readPart(zip, PPTX_PRESENTATION_RELS_PART);
  if (isErr(relationships)) {
    return err(relationships.error);
  }

  const parts: PptxSlidePart[] = [];
  for (const name of slidePartNames(zip, presentation.value, relationships.value ?? "")) {
    const xml = await readPart(zip, name);
    if (isErr(xml)) {
      return err(xml.error);
    }
    if (xml.value !== null) {
      parts.push({ name, xml: xml.value });
    }
  }
  return ok({ zip, parts });
}

/**
 * Lists every slide in presentation order with its paragraphs that have visible text, from
 * shapes and table cells. Speaker notes, layouts, masters, charts, and diagrams are separate
 * parts and are not read.
 */
export async function extractPptxSlideTexts(
  content: Uint8Array | ArrayBuffer,
): Promise<Result<PptxSlideText[], PptxTextError>> {
  const loaded = await loadSlideParts(content);
  if (isErr(loaded)) {
    return err(loaded.error);
  }

  return ok(
    loaded.value.parts.map((part) => ({
      partName: part.name,
      units: scanParagraphs(part.xml).flatMap((paragraph) => {
        const text = paragraphText(paragraph);
        return text.trim() === "" ? [] : [{ id: unitId(part.name, paragraph.index), text }];
      }),
    })),
  );
}

/** Pasted text may carry other line separators and control characters XML cannot hold. */
function normalizeEditedText(value: string): string {
  let text = "";
  for (const character of value.replaceAll("\r\n", PPTX_LINE_BREAK)) {
    const code = character.codePointAt(0) ?? 0;
    if (OTHER_LINE_BREAK_CODES.has(code)) {
      text += PPTX_LINE_BREAK;
    } else if (
      (code >= SPACE_CODE || code === TAB_CODE || code === LINE_FEED_CODE) &&
      !XML_NONCHARACTER_CODES.has(code)
    ) {
      text += character;
    }
  }
  return text;
}

/**
 * Plain text carries no formatting, so an edited paragraph keeps one run's formatting: the
 * run holding most of its text, preferring runs that are not links so the whole paragraph
 * does not become one.
 */
function receivingRun(runs: readonly RunNode[]): RunNode | null {
  const candidates = runs.some((run) => !run.isLink) ? runs.filter((run) => !run.isLink) : runs;
  return candidates.reduce<RunNode | null>(
    (longest, run) => (longest && longest.text.length >= run.text.length ? longest : run),
    null,
  );
}

type Replacement = { start: number; end: number; value: string };

/** Puts the edited text where the receiving run was and drops the other runs and breaks. */
function paragraphReplacements(paragraph: Paragraph, text: string): Replacement[] {
  const receiver = receivingRun(paragraph.nodes.filter((node) => node.kind === "run"));
  if (!receiver) {
    return [];
  }
  const value = text
    .split(PPTX_LINE_BREAK)
    .map((line) =>
      line === "" ? "" : `<a:r>${receiver.properties}<a:t>${encodeXmlText(line)}</a:t></a:r>`,
    )
    .join("<a:br/>");
  return paragraph.nodes.map((node) => ({
    start: node.start,
    end: node.end,
    value: node === receiver ? value : "",
  }));
}

/**
 * Rewrites the text of edited paragraphs inside the original package. Unedited paragraphs
 * and every other part, including layouts, images, backgrounds, notes, and charts, are
 * carried over from `content` unchanged.
 */
export async function applyPptxTextEdits(
  content: Uint8Array | ArrayBuffer,
  edits: Readonly<Record<string, string>>,
): Promise<Result<Uint8Array, PptxTextError>> {
  const loaded = await loadSlideParts(content);
  if (isErr(loaded)) {
    return err(loaded.error);
  }

  for (const part of loaded.value.parts) {
    const replacements = scanParagraphs(part.xml).flatMap((paragraph) => {
      const edited = edits[unitId(part.name, paragraph.index)];
      if (edited === undefined) {
        return [];
      }
      const text = normalizeEditedText(edited);
      return text === paragraphText(paragraph) ? [] : paragraphReplacements(paragraph, text);
    });
    if (replacements.length === 0) {
      continue;
    }

    let xml = part.xml;
    for (const replacement of replacements.toSorted((left, right) => right.start - left.start)) {
      xml = `${xml.slice(0, replacement.start)}${replacement.value}${xml.slice(replacement.end)}`;
    }
    // JSZip would otherwise add directory entries the source package does not have.
    loaded.value.zip.file(part.name, xml, { createFolders: false });
  }

  const generated = await fromThrowableAsync(
    loaded.value.zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
  );
  return isErr(generated) ? err({ code: "invalid_pptx" }) : ok(generated.value);
}
