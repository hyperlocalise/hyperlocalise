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

import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  extractInternalMarkupSpans,
  stripLeakedInternalMarkupFromStoredMessage,
  type ContentEditorInternalMarkupSpan,
} from "./content-editor-internal-markup";

export type OfficeRunLayout = {
  /** Sentinel literals before each run, plus one trailing cluster (`runs.length + 1`). */
  clusters: string[];
  /** Visible text runs from the source segment. */
  runs: string[];
};

const RUN_EDGE_WHITESPACE = /^[ \t\r\n\u00a0]*/;
const RUN_TRAIL_WHITESPACE = /[ \t\r\n\u00a0]*$/;
const WHITESPACE_ONLY_RUN = /^[ \t\r\n\u00a0]*$/;

function oxSpansOnly(message: string): ContentEditorInternalMarkupSpan[] | null {
  const spans = extractInternalMarkupSpans(message);
  if (spans.length === 0) {
    return null;
  }
  if (spans.some((span) => span.family !== "OX")) {
    return null;
  }
  return spans;
}

function parseClustersAndRuns(
  text: string,
  spans: readonly ContentEditorInternalMarkupSpan[],
): { clusters: string[]; runs: string[] } {
  const clusters: string[] = [];
  const runs: string[] = [];
  let pendingCluster = "";
  let cursor = 0;

  for (const span of spans) {
    if (span.start > cursor) {
      clusters.push(pendingCluster);
      runs.push(text.slice(cursor, span.start));
      pendingCluster = "";
    }
    pendingCluster += span.literal;
    cursor = span.end;
  }

  clusters.push(pendingCluster);
  if (cursor < text.length) {
    runs.push(text.slice(cursor));
  }
  clusters.push("");

  return mergeWhitespaceRuns({ clusters, runs });
}

/** Collapses whitespace-only runs between token clusters. */
function mergeWhitespaceRuns(layout: OfficeRunLayout): OfficeRunLayout {
  const clusters = [...layout.clusters];
  const runs = [...layout.runs];
  let index = 0;
  while (index < runs.length) {
    const run = runs[index] ?? "";
    if (!WHITESPACE_ONLY_RUN.test(run)) {
      index += 1;
      continue;
    }
    if (index + 1 >= clusters.length) {
      break;
    }
    clusters[index] = (clusters[index] ?? "") + (clusters[index + 1] ?? "");
    clusters.splice(index + 1, 1);
    runs.splice(index, 1);
  }
  while (runs.length + 1 < clusters.length) {
    clusters.pop();
  }
  while (clusters.length < runs.length + 1) {
    clusters.push("");
  }
  return { clusters, runs };
}

/** Splits a Word/PowerPoint segment into formatting clusters and editable runs. */
export function officeRunLayout(sourceText: string): OfficeRunLayout | null {
  const spans = oxSpansOnly(sourceText);
  if (!spans) {
    return null;
  }
  return parseClustersAndRuns(sourceText, spans);
}

function clustersMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((cluster, index) => cluster === right[index]);
}

/** Returns target run text when token order matches the source layout. */
export function splitOfficeTarget(targetText: string, layout: OfficeRunLayout): string[] | null {
  const cleaned = stripLeakedInternalMarkupFromStoredMessage(targetText);
  if (!cleaned.trim() && layout.runs.every((run) => WHITESPACE_ONLY_RUN.test(run))) {
    return layout.runs.map(() => "");
  }
  const spans = oxSpansOnly(cleaned);
  if (!spans) {
    return cleaned.trim().length === 0 ? layout.runs.map(() => "") : null;
  }
  const parsed = parseClustersAndRuns(cleaned, spans);
  if (!clustersMatch(parsed.clusters, layout.clusters)) {
    return null;
  }
  if (parsed.runs.length !== layout.runs.length) {
    return null;
  }
  return parsed.runs;
}

function applyRunEdgeWhitespace(
  sourceRun: string,
  line: string,
  index: number,
  total: number,
): string {
  let text = line.trim();
  if (index === 0) {
    text = `${sourceRun.match(RUN_EDGE_WHITESPACE)?.[0] ?? ""}${text}`;
  }
  if (index === total - 1) {
    text += sourceRun.match(RUN_TRAIL_WHITESPACE)?.[0] ?? "";
  }
  return text;
}

/** Rebuilds a stored Office target from one editor line per run. */
export function joinOfficeTarget(lines: readonly string[], layout: OfficeRunLayout): string {
  const sourceRuns = layout.runs;
  const normalizedLines = [...lines];
  while (normalizedLines.length < sourceRuns.length) {
    normalizedLines.push("");
  }
  let extra = normalizedLines.slice(sourceRuns.length).filter(Boolean).join(" ");
  const runTexts = sourceRuns.map((sourceRun, index) => {
    const line = normalizedLines[index] ?? "";
    const merged =
      index === sourceRuns.length - 1 && extra
        ? `${line}${line && extra ? " " : ""}${extra}`
        : line;
    extra = "";
    return applyRunEdgeWhitespace(sourceRun, merged, index, sourceRuns.length);
  });

  let out = "";
  for (let index = 0; index < runTexts.length; index += 1) {
    out += layout.clusters[index] ?? "";
    out += runTexts[index] ?? "";
  }
  out += layout.clusters.at(-1) ?? "";
  return out;
}

/** Plain lines for source/target preview when the segment uses only OX markup. */
export function officeRunDisplayLines(message: string): string[] | null {
  const layout = officeRunLayout(message);
  if (!layout) {
    return null;
  }
  const runs = splitOfficeTarget(message, layout) ?? layout.runs;
  return runs.map((run) => run.trim());
}

export function officeRunDocFromLines(lines: readonly string[]): JSONContent {
  return {
    type: "doc",
    content: lines.map((line) => {
      const segments = line.split("\n");
      const content: JSONContent[] = [];
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index] ?? "";
        if (segment.length > 0) {
          content.push({ type: "text", text: segment });
        }
        if (index < segments.length - 1) {
          content.push({ type: "hardBreak" });
        }
      }
      return {
        type: "paragraph",
        content: content.length > 0 ? content : undefined,
      };
    }),
  };
}

/** One string per run; hard breaks inside a run become `\n`. */
export function serializeOfficeRunDoc(doc: ProseMirrorNode): string[] {
  const lines: string[] = [];
  doc.forEach((node) => {
    if (!node.isTextblock) {
      return;
    }
    lines.push(node.textBetween(0, node.content.size, "\n", "\n"));
  });
  return lines;
}
