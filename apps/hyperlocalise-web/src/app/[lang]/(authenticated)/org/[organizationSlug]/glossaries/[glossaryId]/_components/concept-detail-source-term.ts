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
import { selectGlossaryPrimaryTerm } from "@/lib/glossary/glossary";

export type ConceptDetailSourceTermCandidate = {
  id?: string | number;
  locale: string;
  term: string;
  status?: string | null;
};

export function selectConceptDetailSourceTermText(
  terms: readonly ConceptDetailSourceTermCandidate[],
  sourceLocale: string,
) {
  const sourceTerms = terms.filter(
    (term) =>
      term.locale === sourceLocale && (term.id !== undefined || term.term.trim().length > 0),
  );
  const preferredSourceTerm = sourceTerms.find(
    (term) => term.status?.trim().toLowerCase().replaceAll(" ", "_") === "preferred",
  );
  if (preferredSourceTerm) return preferredSourceTerm.term;

  const persistedSourceTerms = sourceTerms.filter((term) => term.id !== undefined);
  return (
    selectGlossaryPrimaryTerm(
      persistedSourceTerms.map((term) => ({
        id: term.id,
        locale: term.locale,
        text: term.term,
        status: term.status,
      })),
      sourceLocale,
    )?.text ??
    sourceTerms[0]?.term ??
    ""
  );
}
