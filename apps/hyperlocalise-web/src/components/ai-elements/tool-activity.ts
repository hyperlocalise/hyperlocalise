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
import type { DynamicToolUIPart, ToolUIPart } from "ai";

import { extractToolInputDetail } from "./tool";

export type ToolPart = ToolUIPart | DynamicToolUIPart;

/** Repository read tools that collapse into Cursor-style explore rollups. */
export const EXPLORE_TOOL_NAMES = new Set([
  "grep",
  "fuzzySearch",
  "read",
  "glob",
  "detectRepoConfig",
  "gitHistory",
]);

export const SEARCH_TOOL_NAMES = new Set(["grep", "fuzzySearch", "glob"]);
export const READ_TOOL_NAMES = new Set(["read"]);

export type ToolActivityBlock =
  | { kind: "explore"; parts: ToolPart[] }
  | { kind: "single"; part: ToolPart };

export function getToolName(part: ToolPart): string {
  if (part.type === "dynamic-tool") {
    return part.toolName;
  }
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  return "tool";
}

export function isExploreToolPart(part: ToolPart): boolean {
  return EXPLORE_TOOL_NAMES.has(getToolName(part));
}

export function isToolPartRunning(part: ToolPart): boolean {
  return part.state === "input-streaming" || part.state === "input-available";
}

export function isToolPartFailed(part: ToolPart): boolean {
  return part.state === "output-error" || part.state === "output-denied";
}

export function groupToolActivityBlocks(parts: ToolPart[]): ToolActivityBlock[] {
  const blocks: ToolActivityBlock[] = [];

  for (const part of parts) {
    const last = blocks.at(-1);
    if (isExploreToolPart(part) && last?.kind === "explore") {
      last.parts.push(part);
      continue;
    }
    if (isExploreToolPart(part)) {
      blocks.push({ kind: "explore", parts: [part] });
      continue;
    }
    blocks.push({ kind: "single", part });
  }

  return blocks;
}

export function formatToolSubject(detail: string | null): string | null {
  if (!detail) {
    return null;
  }

  const trimmed = detail.trim();
  if (!trimmed) {
    return null;
  }

  const withoutQuery = trimmed.split(/[?#]/)[0] ?? trimmed;
  const base = withoutQuery.split(/[/\\]/).filter(Boolean).at(-1);
  return base && base.length > 0 ? base : trimmed;
}

export function getToolPartSubject(part: ToolPart): string | null {
  return formatToolSubject(extractToolInputDetail(part.input));
}

function isPathLikeSubject(subject: string): boolean {
  return subject.includes("/") || subject.includes("\\") || /\.\w{1,8}$/.test(subject);
}

export function getExploreSubject(parts: ToolPart[]): string | null {
  const reversed = [...parts].reverse();

  for (const part of reversed) {
    if (!READ_TOOL_NAMES.has(getToolName(part))) {
      continue;
    }
    const subject = getToolPartSubject(part);
    if (subject) {
      return subject;
    }
  }

  for (const part of reversed) {
    const detail = extractToolInputDetail(part.input);
    if (detail && isPathLikeSubject(detail)) {
      return formatToolSubject(detail);
    }
  }

  for (const part of reversed) {
    const subject = getToolPartSubject(part);
    if (subject) {
      return subject;
    }
  }

  return null;
}

export function getExploreRollupStats(parts: ToolPart[]): {
  subject: string | null;
  searchCount: number;
  readCount: number;
  onlyReads: boolean;
  count: number;
} {
  const subject = getExploreSubject(parts);
  const searchCount = parts.filter((part) => SEARCH_TOOL_NAMES.has(getToolName(part))).length;
  const readCount = parts.filter((part) => READ_TOOL_NAMES.has(getToolName(part))).length;
  const onlyReads = searchCount === 0 && readCount > 0;
  const count = searchCount > 0 ? searchCount : parts.length;

  return { subject, searchCount, readCount, onlyReads, count };
}
