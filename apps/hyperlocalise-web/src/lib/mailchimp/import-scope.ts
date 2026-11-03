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

export function selectedMailchimpResourceIds(
  ids: readonly string[] | null | undefined,
): Set<string> {
  return new Set((ids ?? []).map((id) => id.trim()).filter((id) => id.length > 0));
}

/**
 * Empty campaign and template selections mean "import everything".
 * If either side has IDs, import only the selected IDs for that resource type.
 */
export function shouldImportMailchimpResource(input: {
  resourceId: string;
  selectedIds: ReadonlySet<string>;
  selectedOtherIds: ReadonlySet<string>;
}): boolean {
  if (input.selectedIds.size === 0 && input.selectedOtherIds.size === 0) {
    return true;
  }
  return input.selectedIds.has(input.resourceId);
}
