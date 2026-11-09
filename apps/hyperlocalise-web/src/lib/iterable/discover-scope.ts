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

export function selectInScopeIterableMappings<
  T extends { sourceId: string; resourceKind: "email" | "in_app" | "push" | "sms" | "snippet" },
>(
  mappings: readonly T[],
  input: {
    templateIds?: readonly string[] | null;
    snippetIds?: readonly string[] | null;
  },
): T[] {
  const templateIds = new Set((input.templateIds ?? []).map((id) => id.trim()).filter(Boolean));
  const snippetIds = new Set((input.snippetIds ?? []).map((id) => id.trim()).filter(Boolean));
  const importAllTemplates = templateIds.size === 0;
  const importAllSnippets = snippetIds.size === 0;

  return mappings.filter((mapping) => {
    if (mapping.resourceKind === "snippet") {
      return importAllSnippets || snippetIds.has(mapping.sourceId);
    }
    return importAllTemplates || templateIds.has(mapping.sourceId);
  });
}
