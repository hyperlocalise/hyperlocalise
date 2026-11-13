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

import { isBrazeLocaleCopyName } from "./locale";

export function collectKnownBrazeCopyIds(
  mappings: ReadonlyArray<{ localeCopyIds?: Record<string, string> | null }>,
): Set<string> {
  const ids = new Set<string>();
  for (const mapping of mappings) {
    for (const id of Object.values(mapping.localeCopyIds ?? {})) {
      if (id.trim()) {
        ids.add(id);
      }
    }
  }
  return ids;
}

export function shouldSkipBrazeLibraryItem(input: {
  id: string;
  name: string;
  knownCopyIds: ReadonlySet<string>;
  suffixes: readonly string[];
}): boolean {
  if (input.knownCopyIds.has(input.id)) {
    return true;
  }
  return isBrazeLocaleCopyName({ name: input.name, suffixes: input.suffixes });
}
