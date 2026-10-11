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

import { shouldSkipBrazeLibraryItem } from "./copy-filter";

export type BrazeImportListedItem = {
  id: string;
  name: string;
  updatedAt: Date | null;
};

export type BrazeImportExistingMapping = {
  sourceId: string;
  sourceName: string;
  sourceUpdatedAt: Date | null;
};

export function maxBrazeDate(values: Array<Date | null | undefined>): Date | null {
  let latest: Date | null = null;
  for (const value of values) {
    if (!value) {
      continue;
    }
    if (!latest || value.getTime() > latest.getTime()) {
      latest = value;
    }
  }
  return latest;
}

export function minBrazeDate(values: Array<Date | null | undefined>): Date | null {
  let earliest: Date | null = null;
  for (const value of values) {
    if (!value) {
      continue;
    }
    if (!earliest || value.getTime() < earliest.getTime()) {
      earliest = value;
    }
  }
  return earliest;
}

export function nextBrazeWatermark(input: {
  previous: Date | null | undefined;
  successUpdatedAt: Array<Date | null | undefined>;
  failedUpdatedAt: Array<Date | null | undefined>;
}): Date | null {
  const latestSuccess = maxBrazeDate(input.successUpdatedAt);
  const oldestFailure = minBrazeDate(input.failedUpdatedAt);
  if (!latestSuccess) {
    if (oldestFailure) {
      const beforeFailure = new Date(oldestFailure.getTime() - 1);
      if (input.previous && input.previous.getTime() < oldestFailure.getTime()) {
        return input.previous;
      }
      return input.previous && input.previous.getTime() < beforeFailure.getTime()
        ? input.previous
        : beforeFailure;
    }
    return input.previous ?? null;
  }
  let next = latestSuccess;
  if (oldestFailure) {
    const beforeFailure = new Date(oldestFailure.getTime() - 1);
    if (next.getTime() >= oldestFailure.getTime()) {
      next = beforeFailure;
    }
    if (input.previous && input.previous.getTime() < oldestFailure.getTime()) {
      if (next.getTime() < input.previous.getTime()) {
        return input.previous;
      }
    }
  }
  if (input.previous && next.getTime() < input.previous.getTime() && !oldestFailure) {
    return input.previous;
  }
  return next;
}

export function mergeBrazeImportTargets(input: {
  listed: BrazeImportListedItem[];
  existing: BrazeImportExistingMapping[];
  filterIds: ReadonlySet<string>;
  knownCopyIds: ReadonlySet<string>;
  suffixes: readonly string[];
}): BrazeImportListedItem[] {
  const byId = new Map<string, BrazeImportListedItem>();
  for (const item of input.listed) {
    if (input.filterIds.size > 0 && !input.filterIds.has(item.id)) {
      continue;
    }
    if (
      shouldSkipBrazeLibraryItem({
        id: item.id,
        name: item.name,
        knownCopyIds: input.knownCopyIds,
        suffixes: input.suffixes,
      })
    ) {
      continue;
    }
    byId.set(item.id, item);
  }
  for (const mapping of input.existing) {
    if (input.filterIds.size > 0 && !input.filterIds.has(mapping.sourceId)) {
      continue;
    }
    if (byId.has(mapping.sourceId)) {
      continue;
    }
    byId.set(mapping.sourceId, {
      id: mapping.sourceId,
      name: mapping.sourceName,
      updatedAt: mapping.sourceUpdatedAt,
    });
  }
  return [...byId.values()];
}

export function shouldListBrazeWithoutWatermark(filterIds: ReadonlySet<string>): boolean {
  return filterIds.size > 0;
}
