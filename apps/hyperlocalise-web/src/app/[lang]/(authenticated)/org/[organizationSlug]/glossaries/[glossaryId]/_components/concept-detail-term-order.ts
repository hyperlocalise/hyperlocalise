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
  sortTerms?: (terms: T[]) => T[],
): ConceptDetailTermGroup<T>[] {
  return groups
    .toSorted((left, right) =>
      compareConceptDetailTermGroupLocale(left.locale, right.locale, sourceLocale),
    )
    .map((group) => ({
      ...group,
      terms: sortTerms ? sortTerms(group.terms) : [...group.terms],
    }));
}

export function compareConceptDetailPersistedTerms(
  left: { isPrimary: boolean; status: string; term: string },
  right: { isPrimary: boolean; status: string; term: string },
): number {
  if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;

  const leftPreferred = left.status === "preferred";
  const rightPreferred = right.status === "preferred";
  if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;

  return left.term.localeCompare(right.term);
}

export function sortConceptDetailPersistedTerms<
  T extends { isPrimary: boolean; status: string; term: string },
>(terms: T[]): T[] {
  return terms.toSorted(compareConceptDetailPersistedTerms);
}

export function compareConceptDetailCreatingTerms(
  left: { id: string; term: string },
  right: { id: string; term: string },
): number {
  const leftIsSeed = left.id.startsWith("new-source-");
  const rightIsSeed = right.id.startsWith("new-source-");
  if (leftIsSeed !== rightIsSeed) return leftIsSeed ? -1 : 1;

  return left.term.localeCompare(right.term);
}

export function sortConceptDetailCreatingTerms<T extends { id: string; term: string }>(
  terms: T[],
): T[] {
  return terms.toSorted(compareConceptDetailCreatingTerms);
}
