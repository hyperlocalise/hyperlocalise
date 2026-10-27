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
import {
  extractInternalMarkupSpans,
  formatInternalMarkupForDisplay,
  stripLeakedInternalMarkupNames,
} from "@/components/content-editor/message-format/content-editor-internal-markup";

export type OfficeSegmentGroupKind =
  | "slide"
  | "notes"
  | "document"
  | "header"
  | "footer"
  | "footnotes"
  | "endnotes"
  | "comments"
  | "sheet"
  | "page"
  | "other";

export type OfficeSegmentGroup = {
  /** Stable id for consecutive segments in the same part or sheet. */
  id: string;
  kind: OfficeSegmentGroupKind;
  /** Slide, header, or footer number. */
  number?: number;
  /** Sheet name, or the package part for unrecognised parts. */
  name?: string;
};

const NUMBERED_PART_PATTERNS: readonly [RegExp, OfficeSegmentGroupKind][] = [
  [/^ppt\/slides\/slide(\d+)\.xml$/, "slide"],
  [/^ppt\/notesSlides\/notesSlide(\d+)\.xml$/, "notes"],
  [/^word\/header(\d+)\.xml$/, "header"],
  [/^word\/footer(\d+)\.xml$/, "footer"],
];

const NAMED_PARTS: Readonly<Record<string, OfficeSegmentGroupKind>> = {
  "word/document.xml": "document",
  "word/footnotes.xml": "footnotes",
  "word/endnotes.xml": "endnotes",
  "word/comments.xml": "comments",
};

const XLSX_SHEET_SEPARATOR = "!";
const PDF_PAGE_BLOCK_KEY = /^page-(\d+)#(\d+)$/;

/** Word and PowerPoint keys are `<part>.xml#<paragraph>`; workbook keys never name a part. */
function partKey(key: string): { part: string; paragraph: number } | null {
  const hashIndex = key.lastIndexOf("#");
  const part = key.slice(0, hashIndex);
  const paragraph = Number(key.slice(hashIndex + 1));
  return hashIndex > 0 && part.endsWith(".xml") && Number.isInteger(paragraph)
    ? { part, paragraph }
    : null;
}

/** Groups a segment key by the slide, document part, or sheet it was extracted from. */
export function officeSegmentGroup(key: string): OfficeSegmentGroup {
  const pdfMatch = PDF_PAGE_BLOCK_KEY.exec(key);
  if (pdfMatch) {
    const pageNumber = Number.parseInt(pdfMatch[1]!, 10);
    return { id: `page:${pageNumber}`, kind: "page", number: pageNumber };
  }
  const parsed = partKey(key);
  if (parsed) {
    const { part } = parsed;
    for (const [pattern, kind] of NUMBERED_PART_PATTERNS) {
      const match = pattern.exec(part);
      if (match) {
        return { id: part, kind, number: Number.parseInt(match[1]!, 10) };
      }
    }
    const named = NAMED_PARTS[part];
    if (named) {
      return { id: part, kind: named };
    }
    return { id: part, kind: "other", name: part };
  }
  const separator = key.lastIndexOf(XLSX_SHEET_SEPARATOR);
  if (separator > 0) {
    const sheet = key.slice(0, separator);
    return { id: `sheet:${sheet}`, kind: "sheet", name: sheet };
  }
  return { id: "other", kind: "other" };
}

/** Cell address for sheet keys, otherwise the 1-based paragraph number. */
export function officeSegmentPosition(
  key: string,
): { cell: string } | { paragraph: number } | { block: number } | null {
  const pdfMatch = PDF_PAGE_BLOCK_KEY.exec(key);
  if (pdfMatch) {
    return { block: Number.parseInt(pdfMatch[2]!, 10) };
  }
  const parsed = partKey(key);
  if (parsed) {
    return { paragraph: parsed.paragraph + 1 };
  }
  const separator = key.lastIndexOf(XLSX_SHEET_SEPARATOR);
  return separator > 0 ? { cell: key.slice(separator + 1) } : null;
}

export type OfficeSegmentGroupRun<T> = { group: OfficeSegmentGroup; segments: T[] };

/** Splits file-ordered segments into runs that share a group. */
export function groupOfficeSegments<T extends { key: string }>(
  segments: readonly T[],
): OfficeSegmentGroupRun<T>[] {
  const runs: OfficeSegmentGroupRun<T>[] = [];
  for (const segment of segments) {
    const group = officeSegmentGroup(segment.key);
    const last = runs.at(-1);
    if (last && last.group.id === group.id) {
      last.segments.push(segment);
    } else {
      runs.push({ group, segments: [segment] });
    }
  }
  return runs;
}

/** Shows formatting sentinels as short labels such as `OX#0` so they can be edited as text. */
export function officeFieldText(text: string): string {
  return formatInternalMarkupForDisplay(text);
}

const MARKUP_LABEL_PATTERN = /(MD|HT|LQ|UE|OX)#(\d+)/g;

/**
 * Restores sentinels from labels using the source segment's tokens. Labels the source does not
 * define stay as typed so QA reports them.
 */
export function officeTargetFromFieldText(fieldText: string, sourceText: string): string {
  fieldText = stripLeakedInternalMarkupNames(fieldText);
  const literals = new Map(
    extractInternalMarkupSpans(sourceText).map((span) => [span.label, span.literal]),
  );
  const restored =
    literals.size === 0
      ? fieldText
      : fieldText.replace(MARKUP_LABEL_PATTERN, (label, family: string, digits: string) => {
          // A label can be followed by typed digits ("OX#1" then "0"), so take the longest known label.
          for (let length = digits.length; length > 0; length -= 1) {
            const literal = literals.get(`${family}#${digits.slice(0, length)}`);
            if (literal) {
              return literal + digits.slice(length);
            }
          }
          return label;
        });
  return applyOfficeEdgeWhitespace(sourceText, restored);
}

const OFFICE_EDGE_WHITESPACE = /^[ \t\r\n\u00a0]*/;

function applyOfficeEdgeWhitespace(source: string, target: string): string {
  const sourceLead = source.match(OFFICE_EDGE_WHITESPACE)?.[0] ?? "";
  const sourceTrail = source.match(/[ \t\r\n\u00a0]*$/)?.[0] ?? "";
  const targetLead = target.match(OFFICE_EDGE_WHITESPACE)?.[0] ?? "";
  const targetTrail = target.match(/[ \t\r\n\u00a0]*$/)?.[0] ?? "";
  return (
    sourceLead + target.slice(targetLead.length, target.length - targetTrail.length) + sourceTrail
  );
}
