import type { ExternalTmsTranslationUnit } from "@/lib/providers/jobs/tms-provider-types";

import {
  confidenceForProviderCheckType,
  normalizeProviderQaFinding,
} from "./normalize-provider-findings";
import type {
  ProviderQaFinding,
  ProviderQaGlossaryTerm,
  ProviderQaItemReference,
  ProviderQaRunOptions,
} from "./types";

function itemRef(
  unit: ExternalTmsTranslationUnit,
  input: { locale?: string; field?: "source" | "target" },
): ProviderQaItemReference {
  return {
    externalStringId: unit.externalStringId,
    key: unit.key,
    ...(input.locale ? { locale: input.locale } : {}),
    ...(input.field ? { field: input.field } : {}),
  };
}

function readPayloadString(payload: Record<string, unknown> | undefined, key: string) {
  const value = payload?.[key];
  return typeof value === "string" ? value : null;
}

function isWhitespaceOnly(text: string) {
  return text.trim().length === 0;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findGlossaryMatches(text: string, term: ProviderQaGlossaryTerm) {
  // Use a more robust approach for word boundaries that handles non-word characters at the start or end of a term.
  // Specifically, ensure that a match is only valid if it's not preceded or followed by a word character ([a-zA-Z0-9_]).
  const patternStr = `(?<![a-zA-Z0-9_])${escapeRegExp(term.sourceTerm)}(?![a-zA-Z0-9_])`;
  const pattern = term.caseSensitive ? new RegExp(patternStr) : new RegExp(patternStr, "i");

  return pattern.test(text);
}

function checkStaleUnchangedTarget(
  unit: ExternalTmsTranslationUnit,
  locale: string,
  sourceText: string,
  targetText: string,
): ProviderQaFinding | null {
  const payload = unit.providerPayload ?? {};
  const previousSource = readPayloadString(payload, "previousSourceText");
  const previousTarget = readPayloadString(payload, "previousTargetText");

  if (!previousSource || !previousTarget) {
    return null;
  }

  if (previousSource === sourceText || previousTarget !== targetText) {
    return null;
  }

  return normalizeProviderQaFinding({
    checkType: "stale_unchanged_target",
    severity: "warning",
    message: "Target was not updated after the source string changed",
    suggestedFix: "Re-translate this string so the target reflects the updated source.",
    confidence: confidenceForProviderCheckType("stale_unchanged_target"),
    item: itemRef(unit, { locale, field: "target" }),
  });
}

function checkLengthExpansion(
  unit: ExternalTmsTranslationUnit,
  locale: string,
  sourceText: string,
  targetText: string,
  options: ProviderQaRunOptions,
): ProviderQaFinding | null {
  const sourceLength = sourceText.trim().length;
  const targetLength = targetText.trim().length;
  if (sourceLength === 0 || targetLength === 0) {
    return null;
  }

  const ratio = targetLength / sourceLength;
  const warningRatio = options.lengthExpansionWarningRatio ?? 1.5;
  const errorRatio = options.lengthExpansionErrorRatio ?? 2;

  if (ratio < warningRatio) {
    return null;
  }

  const severity = ratio >= errorRatio ? "error" : "warning";

  return normalizeProviderQaFinding({
    checkType: "length_expansion",
    severity,
    message: `Target is ${Math.round(ratio * 100)}% of source length (${targetLength} vs ${sourceLength} characters)`,
    suggestedFix: "Shorten the translation or confirm the extra length is intentional.",
    confidence: confidenceForProviderCheckType("length_expansion"),
    item: itemRef(unit, { locale, field: "target" }),
  });
}

function checkGlossaryViolations(
  unit: ExternalTmsTranslationUnit,
  locale: string,
  sourceText: string,
  targetText: string,
  glossaryTerms: ProviderQaGlossaryTerm[],
): ProviderQaFinding[] {
  const findings: ProviderQaFinding[] = [];

  for (const term of glossaryTerms) {
    if (term.forbidden && findGlossaryMatches(targetText, term)) {
      findings.push(
        normalizeProviderQaFinding({
          checkType: "glossary_violation",
          severity: "error",
          message: `Forbidden term "${term.sourceTerm}" appears in the target`,
          suggestedFix: `Remove or replace "${term.sourceTerm}" in the target translation.`,
          confidence: confidenceForProviderCheckType("glossary_violation"),
          item: itemRef(unit, { locale, field: "target" }),
        }),
      );
      continue;
    }

    if (!findGlossaryMatches(sourceText, term)) {
      continue;
    }

    const expected = term.targetTerm.trim();
    if (!expected) {
      continue;
    }

    const patternStr = `(?<![a-zA-Z0-9_])${escapeRegExp(expected)}(?![a-zA-Z0-9_])`;
    const pattern = term.caseSensitive ? new RegExp(patternStr) : new RegExp(patternStr, "i");

    if (!pattern.test(targetText)) {
      findings.push(
        normalizeProviderQaFinding({
          checkType: "glossary_violation",
          severity: "warning",
          message: `Glossary term "${term.sourceTerm}" requires target rendering "${term.targetTerm}"`,
          suggestedFix: `Use "${term.targetTerm}" when translating "${term.sourceTerm}".`,
          confidence: confidenceForProviderCheckType("glossary_violation"),
          item: itemRef(unit, { locale, field: "target" }),
        }),
      );
    }
  }

  return findings;
}

export function collectSupplementalQaFindings(
  unit: ExternalTmsTranslationUnit,
  options: ProviderQaRunOptions & { sourceLocale: string },
): ProviderQaFinding[] {
  const findings: ProviderQaFinding[] = [];
  const sourceText = unit.sourceText ?? "";
  const glossaryTerms = options.glossaryTerms ?? [];
  const translationsByLocale = new Map(
    unit.translations.map((translation) => [translation.locale, translation.text]),
  );

  for (const locale of options.targetLocales) {
    const targetText = translationsByLocale.get(locale);
    if (targetText === undefined || isWhitespaceOnly(targetText)) {
      continue;
    }

    const stale = checkStaleUnchangedTarget(unit, locale, sourceText, targetText);
    if (stale) {
      findings.push(stale);
    }

    const lengthExpansion = checkLengthExpansion(unit, locale, sourceText, targetText, options);
    if (lengthExpansion) {
      findings.push(lengthExpansion);
    }

    if (glossaryTerms.length > 0) {
      findings.push(
        ...checkGlossaryViolations(unit, locale, sourceText, targetText, glossaryTerms),
      );
    }
  }

  return findings;
}
