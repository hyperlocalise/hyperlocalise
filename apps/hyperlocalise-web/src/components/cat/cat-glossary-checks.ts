import type { CatFormatMessageIntl } from "./cat-message-format-i18n";
import { catGlossaryChecksMessages } from "./cat.messages";
import type { CatFormatCheck, CatGlossaryTerm } from "./types";

const UNICODE_WORD_CHAR = String.raw`\p{L}\p{N}_`;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsGlossaryTerm(text: string, term: string) {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) {
    return false;
  }

  const patternStr = `(?<![${UNICODE_WORD_CHAR}])${escapeRegExp(normalizedTerm)}(?![${UNICODE_WORD_CHAR}])`;
  return new RegExp(patternStr, "iu").test(text);
}

export function glossaryFormatChecksForSegment(
  sourceText: string,
  targetText: string,
  glossaryTerms: CatGlossaryTerm[],
  intl: CatFormatMessageIntl,
): CatFormatCheck[] {
  if (glossaryTerms.length === 0 || !targetText.trim()) {
    return [];
  }

  const checks: CatFormatCheck[] = [];
  let evaluatedTermCount = 0;

  for (const term of glossaryTerms) {
    if (term.forbidden) {
      evaluatedTermCount += 1;
      if (containsGlossaryTerm(targetText, term.source)) {
        checks.push({
          id: `glossary-forbidden-${term.id}`,
          label: intl.formatMessage(catGlossaryChecksMessages.forbiddenTermLabel),
          status: "fail",
          message: intl.formatMessage(catGlossaryChecksMessages.forbiddenTermMessage, {
            term: term.source,
          }),
          category: "glossary",
          relatedTokens: [term.source],
        });
      }
      continue;
    }

    if (!term.approved) {
      continue;
    }

    if (!containsGlossaryTerm(sourceText, term.source)) {
      continue;
    }

    const expectedTarget = term.target.trim();
    if (!expectedTarget) {
      continue;
    }

    evaluatedTermCount += 1;

    if (!containsGlossaryTerm(targetText, expectedTarget)) {
      checks.push({
        id: `glossary-missing-${term.id}`,
        label: intl.formatMessage(catGlossaryChecksMessages.missingTermLabel),
        status: "warn",
        message: intl.formatMessage(catGlossaryChecksMessages.missingTermMessage, {
          sourceTerm: term.source,
          targetTerm: expectedTarget,
        }),
        category: "glossary",
        relatedTokens: [term.source, expectedTarget],
      });
    }
  }

  if (evaluatedTermCount > 0 && checks.length === 0) {
    checks.push({
      id: "glossary-compliance",
      label: intl.formatMessage(catGlossaryChecksMessages.complianceLabel),
      status: "pass",
      message: intl.formatMessage(catGlossaryChecksMessages.compliancePassMessage),
      category: "glossary",
    });
  }

  return checks;
}
