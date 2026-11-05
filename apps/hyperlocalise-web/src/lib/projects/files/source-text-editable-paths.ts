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
 * Which files' strings may have their source text edited in the platform: key-value files the
 * platform can write edited text back into, so far the JSON family (`writeJsonSourceText`).
 * Documents (HTML, Markdown, Office, PDF) are cut into strings by position with inline markup
 * hidden in markers; gettext PO and Qt TS are keyed by the source text itself; code files belong
 * to developers. Other key-value formats (YAML, XLIFF, Apple and Android strings, RESX,
 * properties) join the list once a writer exists. The Go services, which decide where an edit may
 * be made, read the same list and the upload surfaces it applies to from `internal/sourcetext`;
 * keep the two in step. Free of server imports, so a workflow can check a path.
 */
export const SOURCE_EDITABLE_EXTENSIONS = [".json", ".jsonc", ".arb"] as const;

export function isSourceEditableSourcePath(sourcePath: string): boolean {
  const lower = sourcePath.toLowerCase();
  return SOURCE_EDITABLE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}
