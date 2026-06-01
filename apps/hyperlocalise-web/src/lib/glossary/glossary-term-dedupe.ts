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
