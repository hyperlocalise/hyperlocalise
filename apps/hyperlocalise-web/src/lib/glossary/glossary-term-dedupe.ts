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
type GlossaryTermDuplicateInput = {
  sourceTerm: string;
  caseSensitive: boolean;
};

type ExistingGlossaryTerm = {
  sourceTerm: string;
};

export function createGlossaryTermDuplicateTracker(existing: ExistingGlossaryTerm[]) {
  const seenExactSourceTerms = new Set(existing.map((term) => term.sourceTerm));
  const seenCaseInsensitiveSourceTerms = new Set(
    existing.map((term) => term.sourceTerm.toLowerCase()),
  );

  return {
    hasDuplicateAndTrack(input: GlossaryTermDuplicateInput) {
      const sourceTermKey = input.sourceTerm;
      const caseInsensitiveSourceTermKey = input.sourceTerm.toLowerCase();
      const duplicateExists = input.caseSensitive
        ? seenExactSourceTerms.has(sourceTermKey)
        : seenCaseInsensitiveSourceTerms.has(caseInsensitiveSourceTermKey);

      if (!duplicateExists) {
        seenExactSourceTerms.add(sourceTermKey);
        seenCaseInsensitiveSourceTerms.add(caseInsensitiveSourceTermKey);
      }

      return duplicateExists;
    },
  };
}
