export type GlossaryTermConstraint = {
  sourceTerm: string;
  targetTerm: string;
  targetLocale: string;
  forbidden: boolean | null;
  caseSensitive?: boolean | null;
};

export type GlossaryValidationFailure = {
  sourceTerm: string;
  targetTerm: string;
  forbidden: boolean;
  reason: "missing_preferred_term" | "contains_forbidden_term";
};

export type GlossaryTranslationUnit = {
  externalStringId: string;
  key: string;
  sourceText: string;
  locale: string;
  translatedText: string;
};

export function sourceContainsTerm(
  sourceText: string,
  term: { sourceTerm: string; caseSensitive: boolean },
) {
  if (term.caseSensitive) {
    return sourceText.includes(term.sourceTerm);
  }

  return sourceText.toLocaleLowerCase().includes(term.sourceTerm.toLocaleLowerCase());
}

function translationContainsTerm(text: string, term: string, caseSensitive: boolean) {
  return caseSensitive
    ? text.includes(term)
    : text.toLocaleLowerCase().includes(term.toLocaleLowerCase());
}

export function validateGlossaryTermsInTranslation(input: {
  sourceText: string;
  translatedText: string;
  terms: GlossaryTermConstraint[];
}) {
  const failures: GlossaryValidationFailure[] = [];

  for (const term of input.terms) {
    const caseSensitive = term.caseSensitive === true;
    if (!sourceContainsTerm(input.sourceText, { sourceTerm: term.sourceTerm, caseSensitive })) {
      continue;
    }

    const hasTarget = translationContainsTerm(input.translatedText, term.targetTerm, caseSensitive);
    if (term.forbidden === true) {
      if (hasTarget) {
        failures.push({
          sourceTerm: term.sourceTerm,
          targetTerm: term.targetTerm,
          forbidden: true,
          reason: "contains_forbidden_term",
        });
      }
      continue;
    }

    if (term.forbidden === false && !hasTarget) {
      failures.push({
        sourceTerm: term.sourceTerm,
        targetTerm: term.targetTerm,
        forbidden: false,
        reason: "missing_preferred_term",
      });
    }
  }

  return failures;
}

function translationUnitKey(unit: Pick<GlossaryTranslationUnit, "externalStringId" | "locale">) {
  return `${unit.externalStringId}:${unit.locale}`;
}

function glossaryTermsForLocale(terms: GlossaryTermConstraint[], locale: string) {
  return terms.filter((term) => term.targetLocale === locale);
}

export function validateGlossaryForTranslationUnits(
  units: GlossaryTranslationUnit[],
  terms: GlossaryTermConstraint[],
) {
  const failuresByUnitKey = new Map<string, GlossaryValidationFailure[]>();

  for (const unit of units) {
    const localeTerms = glossaryTermsForLocale(terms, unit.locale);
    if (localeTerms.length === 0) {
      continue;
    }

    const failures = validateGlossaryTermsInTranslation({
      sourceText: unit.sourceText,
      translatedText: unit.translatedText,
      terms: localeTerms,
    });

    if (failures.length > 0) {
      failuresByUnitKey.set(translationUnitKey(unit), failures);
    }
  }

  return failuresByUnitKey;
}

export function translationUnitHasGlossaryViolations(
  unit: GlossaryTranslationUnit,
  terms: GlossaryTermConstraint[],
) {
  return validateGlossaryForTranslationUnits([unit], terms).size > 0;
}
