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
import { assertNever } from "@/lib/primitives/assert-never/assert-never";

/**
 * How a template change was triggered, since the create dialog's clobber rule differs by origin:
 *
 * - "explicit_pick": the user picked a template (or switched from one template to another).
 *   Applies unconditionally, replacing a dirty description — a picker that visibly does nothing
 *   reads as broken, and TipTap undo recovers the previous text.
 * - "explicit_clear": the user picked "No template". Only drops the skeleton while the
 *   description is still pristine; type and priority are never touched by clearing.
 * - "automatic": the project default applying on dialog open, or after a project switch with no
 *   in-session template pick. All-or-nothing — never overwrites a dirty description, matching
 *   "explicit_clear"'s gating exactly.
 */
export type IssueSheetTemplateChangeOrigin = "explicit_pick" | "explicit_clear" | "automatic";

/**
 * Resolves the create dialog's description text when a template is applied, swapped, or cleared.
 *
 * `isDirty` must come from a flag the caller sets on user input and clears on every programmatic
 * write — never from comparing description strings. The description field is TipTap
 * (MarkdownEditor), which round-trips markdown through ProseMirror and can normalize whitespace,
 * so `description === lastAppliedSkeleton` can drift to false on its own and permanently latch
 * every rule below into "touched, never overwrite again".
 */
export function resolveDescriptionOnTemplateChange(input: {
  currentDescription: string;
  isDirty: boolean;
  nextSkeleton: string | null;
  origin: IssueSheetTemplateChangeOrigin;
}): string {
  switch (input.origin) {
    case "explicit_pick":
      return input.nextSkeleton ?? "";
    case "explicit_clear":
    case "automatic":
      if (input.isDirty) {
        return input.currentDescription;
      }
      return input.nextSkeleton ?? "";
    default:
      return assertNever(input.origin);
  }
}

/**
 * Composes a template's description skeleton with CAT segment source text, when present.
 *
 * Skeleton above, source below as a blockquote: the prompts are the actionable part and belong
 * where the user starts typing, while the source is reference material. Every source line gets
 * its own `>` prefix — a single prefix on a multi-line string only quotes the first line and lets
 * the rest escape the blockquote. `sourceLabel` is caller-supplied (via `intl.formatMessage`)
 * rather than hardcoded, since it is user-facing copy persisted into the issue body.
 */
export function composeIssueDescription(input: {
  skeleton: string | null;
  sourceText: string | null | undefined;
  sourceLabel: string;
}): string {
  const skeletonPart = input.skeleton ?? "";
  const trimmedSource = input.sourceText?.trim();
  if (!trimmedSource) {
    return skeletonPart;
  }

  const quotedSource = trimmedSource
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
  const sourceBlock = `> ${input.sourceLabel}\n>\n${quotedSource}\n`;

  return skeletonPart ? `${skeletonPart}\n${sourceBlock}` : sourceBlock;
}

const HEADING_PATTERN = /^(#{1,6})\s+\S/;

function headingLevel(line: string): number | null {
  const match = HEADING_PATTERN.exec(line);
  return match ? match[1]!.length : null;
}

function collapseBlankRuns(lines: string[]): string[] {
  const collapsed: string[] = [];
  for (const line of lines) {
    if (line.trim() === "" && collapsed.at(-1)?.trim() === "") {
      continue;
    }
    collapsed.push(line);
  }
  while (collapsed.length > 0 && collapsed[0]?.trim() === "") {
    collapsed.shift();
  }
  while (collapsed.length > 0 && collapsed.at(-1)?.trim() === "") {
    collapsed.pop();
  }
  return collapsed;
}

/**
 * Drops unfilled template sections on submit: any heading with nothing but blank lines before the
 * next heading of the same or shallower level. Structural, not a diff against the original
 * skeleton — the description round-trips through TipTap/markdown normalization, which makes
 * diffing fragile. A section with no headings at all is left untouched. A heading immediately
 * followed by a nested subheading (e.g. `##` then `###`) counts the subheading and everything
 * under it as that section's content, so it is not considered empty.
 */
export function stripEmptySections(markdown: string): string {
  const lines = markdown.split("\n");
  const levels = lines.map(headingLevel);

  if (!levels.some((level) => level !== null)) {
    return markdown;
  }

  const keep: boolean[] = Array.from({ length: lines.length }, () => true);

  for (let i = 0; i < lines.length; i++) {
    const level = levels[i];
    if (level === null) {
      continue;
    }

    let sectionEnd = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const nextLevel = levels[j];
      if (nextLevel !== null && nextLevel <= level) {
        sectionEnd = j;
        break;
      }
    }

    const hasContent = lines.slice(i + 1, sectionEnd).some((line) => line.trim().length > 0);
    if (!hasContent) {
      for (let k = i; k < sectionEnd; k++) {
        keep[k] = false;
      }
    }
  }

  return collapseBlankRuns(lines.filter((_, index) => keep[index])).join("\n");
}
