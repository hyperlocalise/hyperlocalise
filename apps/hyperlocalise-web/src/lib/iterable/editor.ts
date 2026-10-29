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

import type { IterableEditorKind } from "./types";

function readEditorType(payload: Record<string, unknown>): string {
  const raw =
    (typeof payload.editorType === "string" && payload.editorType) ||
    (typeof payload.editor === "string" && payload.editor) ||
    "";
  return raw.trim();
}

/** Fail closed: drag-and-drop unless Iterable proves WYSIWYG or side-by-side. */
export function classifyIterableHtmlEditor(payload: Record<string, unknown>): IterableEditorKind {
  const normalized = readEditorType(payload).toLowerCase();
  if (!normalized) {
    return "drag_and_drop";
  }
  if (normalized.includes("side") && normalized.includes("by")) {
    return "side_by_side";
  }
  if (
    normalized === "visual" ||
    normalized === "classic" ||
    normalized === "simple" ||
    normalized === "wysiwyg"
  ) {
    return "wysiwyg";
  }
  if (normalized === "bee" || normalized.includes("drag")) {
    return "drag_and_drop";
  }
  return "drag_and_drop";
}

export function isIterableInPlaceHtmlEditor(kind: IterableEditorKind): boolean {
  return kind === "wysiwyg" || kind === "side_by_side";
}
