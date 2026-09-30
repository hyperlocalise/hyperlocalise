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

/**
 * Workspace persona — a named layout preset that adapts the Editor to a
 * specific role and content type.
 *
 * - "translator"  : Three-panel layout (queue | editor | intelligence).
 *                   Keyboard-first, multi-select always accessible,
 *                   TM/Glossary always visible. Optimised for string-file work.
 *
 * - "designer"    : Full-screen file view, side-by-side asset comparison.
 *                   No queue panel. Upload + AI Regenerate as primary CTAs.
 *                   Optimised for image/video/office/document file work.
 *
 * - "reviewer"    : Dense table layout with persistent bulk-action bar and
 *                   running status tally. Optimised for QA review workflows.
 *                   Available for text-family files only (string queues).
 */
export type ContentEditorWorkspacePersona = "translator" | "designer" | "reviewer";

export const CAT_WORKSPACE_PERSONA_STORAGE_KEY_PREFIX = "content-editor-workspace-persona:v1";

/** File-family values that map naturally to the Designer persona. */
export const DESIGNER_PERSONA_FILE_FAMILIES = new Set([
  "image",
  "video",
  "office",
  "document",
] as const);

/** Valid persona values for type-guard use. */
const VALID_PERSONAS = new Set<ContentEditorWorkspacePersona>([
  "translator",
  "designer",
  "reviewer",
]);

export function isCatWorkspacePersona(value: unknown): value is ContentEditorWorkspacePersona {
  return typeof value === "string" && VALID_PERSONAS.has(value as ContentEditorWorkspacePersona);
}

/**
 * Derives a stable per-file-family localStorage key so the persona preference
 * is remembered independently for string files vs. image files vs. office files etc.
 *
 * The key intentionally omits the specific path/locale so it applies broadly
 * within the same file family across the workspace.
 */
export function catWorkspacePersonaStorageKey(fileFamily: string): string {
  return `${CAT_WORKSPACE_PERSONA_STORAGE_KEY_PREFIX}:${fileFamily}`;
}

export function readCatWorkspacePersona(fileFamily: string): ContentEditorWorkspacePersona | null {
  try {
    const raw = window.localStorage.getItem(catWorkspacePersonaStorageKey(fileFamily));
    return isCatWorkspacePersona(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeCatWorkspacePersona(
  fileFamily: string,
  persona: ContentEditorWorkspacePersona,
): void {
  try {
    window.localStorage.setItem(catWorkspacePersonaStorageKey(fileFamily), persona);
  } catch {
    // localStorage unavailable (private browsing, storage quota) — ignore silently
  }
}

/**
 * Returns the default (auto-detected) persona for a given file family.
 * Used when no stored preference exists for this family.
 */
export function defaultPersonaForFileFamily(fileFamily: string): ContentEditorWorkspacePersona {
  if (DESIGNER_PERSONA_FILE_FAMILIES.has(fileFamily as never)) {
    return "designer";
  }
  return "translator";
}
