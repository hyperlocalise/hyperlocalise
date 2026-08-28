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
export type ConceptDetailTermGroup<T> = {
  locale: string;
  terms: T[];
};

export function compareConceptDetailTermGroupLocale(
  leftLocale: string,
  rightLocale: string,
  sourceLocale: string,
): number {
  if (leftLocale === sourceLocale) return rightLocale === sourceLocale ? 0 : -1;
  if (rightLocale === sourceLocale) return 1;
  return leftLocale.localeCompare(rightLocale);
}

export function sortConceptDetailTermGroups<T>(
  groups: ConceptDetailTermGroup<T>[],
  sourceLocale: string,
): ConceptDetailTermGroup<T>[] {
  return groups
    .toSorted((left, right) =>
      compareConceptDetailTermGroupLocale(left.locale, right.locale, sourceLocale),
    )
    .map((group) => ({
      ...group,
      terms: [...group.terms],
    }));
}
