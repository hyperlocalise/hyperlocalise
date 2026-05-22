import type { ExternalTmsTranslationUnit } from "@/lib/providers/external-tms-content-sync";

import {
  formatIcuBlocks,
  parseTextInvariant,
  sameIcuBlocks,
  samePlaceholderSet,
} from "./invariant";
import type {
  ProviderQaFinding,
  ProviderQaGlossaryTerm,
  ProviderQaItemReference,
  ProviderQaRunOptions,
} from "./types";

const markdownLinkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;

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

function looksLikeJson(text: string) {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return false;
  }

  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return trimmed.includes('"');
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findGlossaryMatches(text: string, term: ProviderQaGlossaryTerm) {
  const pattern = term.caseSensitive
    ? new RegExp(`\\b${escapeRegExp(term.sourceTerm)}\\b`)
    : new RegExp(`\\b${escapeRegExp(term.sourceTerm)}\\b`, "i");

  return pattern.test(text);
}

function collectMarkdownLinks(text: string) {
  const links: Array<{ label: string; href: string }> = [];
  for (const match of text.matchAll(markdownLinkPattern)) {
    links.push({
      label: match[1] ?? "",
      href: match[2] ?? "",
    });
  }
  return links;
}

function checkPlaceholderAndIcu(
  unit: ExternalTmsTranslationUnit,
  locale: string,
  sourceText: string,
  targetText: string,
): ProviderQaFinding[] {
  const findings: ProviderQaFinding[] = [];
  const sourceInvariant = parseTextInvariant(sourceText);
  const targetInvariant = parseTextInvariant(targetText);

  if (targetInvariant.parseError) {
    findings.push({
      checkType: "invalid_icu_structure",
      severity: "error",
      message: `Invalid ICU or placeholder structure in target: ${targetInvariant.parseError}`,
      suggestedFix: "Fix braces and ICU MessageFormat syntax in the target string.",
      item: itemRef(unit, { locale, field: "target" }),
    });
    return findings;
  }

  if (!samePlaceholderSet(sourceInvariant.placeholders, targetInvariant.placeholders)) {
    findings.push({
      checkType: "placeholder_mismatch",
      severity: "error",
      message: `Placeholder mismatch (expected [${sourceInvariant.placeholders.join(", ")}], got [${targetInvariant.placeholders.join(", ")}])`,
      suggestedFix: "Copy missing placeholders from the source string into the target.",
      item: itemRef(unit, { locale, field: "target" }),
    });
  }

  if (!sameIcuBlocks(sourceInvariant.icuBlocks, targetInvariant.icuBlocks)) {
    findings.push({
      checkType: "icu_shape_mismatch",
      severity: "error",
      message: `ICU structure mismatch (expected ${formatIcuBlocks(sourceInvariant.icuBlocks)}, got ${formatIcuBlocks(targetInvariant.icuBlocks)})`,
      suggestedFix:
        "Mirror plural, select, and selectordinal blocks from the source in the target.",
      item: itemRef(unit, { locale, field: "target" }),
    });
  }

  return findings;
}

function checkMissingTranslation(
  unit: ExternalTmsTranslationUnit,
  locale: string,
  targetText: string | undefined,
): ProviderQaFinding | null {
  if (targetText !== undefined && !isWhitespaceOnly(targetText)) {
    return null;
  }

  return {
    checkType: "missing_translation",
    severity: "error",
    message: `Missing translation for locale ${locale}`,
    suggestedFix: "Provide a non-empty translation for this locale.",
    item: itemRef(unit, { locale, field: "target" }),
  };
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

  return {
    checkType: "stale_unchanged_target",
    severity: "warning",
    message: "Target was not updated after the source string changed",
    suggestedFix: "Re-translate this string so the target reflects the updated source.",
    item: itemRef(unit, { locale, field: "target" }),
  };
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

  return {
    checkType: "length_expansion",
    severity,
    message: `Target is ${Math.round(ratio * 100)}% of source length (${targetLength} vs ${sourceLength} characters)`,
    suggestedFix: "Shorten the translation or confirm the extra length is intentional.",
    item: itemRef(unit, { locale, field: "target" }),
  };
}

function checkJsonValidity(
  unit: ExternalTmsTranslationUnit,
  locale: string,
  field: "source" | "target",
  text: string,
): ProviderQaFinding | null {
  if (!looksLikeJson(text)) {
    return null;
  }

  try {
    JSON.parse(text);
    return null;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    return {
      checkType: "json_invalid",
      severity: "error",
      message: `Invalid JSON in ${field}: ${detail}`,
      suggestedFix: "Fix JSON syntax so the string parses successfully.",
      item: itemRef(unit, { locale, field }),
    };
  }
}

function checkMarkdownLinks(
  unit: ExternalTmsTranslationUnit,
  locale: string,
  field: "source" | "target",
  text: string,
): ProviderQaFinding[] {
  const findings: ProviderQaFinding[] = [];

  for (const link of collectMarkdownLinks(text)) {
    if (!link.href.trim()) {
      findings.push({
        checkType: "markdown_link",
        severity: "error",
        message: `Markdown link "${link.label}" is missing a URL`,
        suggestedFix: "Add a destination URL inside the link parentheses.",
        item: itemRef(unit, { locale, field }),
      });
    }
  }

  return findings;
}

function checkMarkdownLinkParity(
  unit: ExternalTmsTranslationUnit,
  locale: string,
  sourceText: string,
  targetText: string,
): ProviderQaFinding | null {
  const sourceHrefs = collectMarkdownLinks(sourceText).map((link) => link.href);
  const targetHrefs = collectMarkdownLinks(targetText).map((link) => link.href);

  if (sourceHrefs.length === 0 && targetHrefs.length === 0) {
    return null;
  }

  const sourceSet = new Set(sourceHrefs);
  const missing = sourceHrefs.filter((href) => !targetHrefs.includes(href));
  if (missing.length === 0) {
    return null;
  }

  return {
    checkType: "markdown_link",
    severity: "warning",
    message: `Target is missing markdown link URL(s) from source: ${missing.filter((href) => sourceSet.has(href)).join(", ")}`,
    suggestedFix: "Preserve source markdown link destinations in the target.",
    item: itemRef(unit, { locale, field: "target" }),
  };
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
      findings.push({
        checkType: "glossary_violation",
        severity: "error",
        message: `Forbidden term "${term.sourceTerm}" appears in the target`,
        suggestedFix: `Remove or replace "${term.sourceTerm}" in the target translation.`,
        item: itemRef(unit, { locale, field: "target" }),
      });
      continue;
    }

    if (!findGlossaryMatches(sourceText, term)) {
      continue;
    }

    const expected = term.targetTerm.trim();
    if (!expected) {
      continue;
    }

    const pattern = term.caseSensitive
      ? new RegExp(`\\b${escapeRegExp(expected)}\\b`)
      : new RegExp(`\\b${escapeRegExp(expected)}\\b`, "i");

    if (!pattern.test(targetText)) {
      findings.push({
        checkType: "glossary_violation",
        severity: "warning",
        message: `Glossary term "${term.sourceTerm}" requires target rendering "${term.targetTerm}"`,
        suggestedFix: `Use "${term.targetTerm}" when translating "${term.sourceTerm}".`,
        item: itemRef(unit, { locale, field: "target" }),
      });
    }
  }

  return findings;
}

export function collectUnitQaFindings(
  unit: ExternalTmsTranslationUnit,
  options: ProviderQaRunOptions,
): ProviderQaFinding[] {
  const findings: ProviderQaFinding[] = [];
  const sourceText = unit.sourceText ?? "";
  const glossaryTerms = options.glossaryTerms ?? [];

  findings.push(
    ...checkMarkdownLinks(unit, options.targetLocales[0] ?? "source", "source", sourceText),
  );
  const sourceJsonFinding = checkJsonValidity(
    unit,
    options.targetLocales[0] ?? "source",
    "source",
    sourceText,
  );
  if (sourceJsonFinding) {
    findings.push(sourceJsonFinding);
  }

  const translationsByLocale = new Map(
    unit.translations.map((translation) => [translation.locale, translation.text]),
  );

  for (const locale of options.targetLocales) {
    const targetText = translationsByLocale.get(locale);

    const missing = checkMissingTranslation(unit, locale, targetText);
    if (missing) {
      findings.push(missing);
      continue;
    }

    const resolvedTarget = targetText ?? "";

    const targetJsonFinding = checkJsonValidity(unit, locale, "target", resolvedTarget);
    if (targetJsonFinding) {
      findings.push(targetJsonFinding);
    } else {
      findings.push(...checkPlaceholderAndIcu(unit, locale, sourceText, resolvedTarget));
    }

    findings.push(...checkMarkdownLinks(unit, locale, "target", resolvedTarget));

    const markdownParity = checkMarkdownLinkParity(unit, locale, sourceText, resolvedTarget);
    if (markdownParity) {
      findings.push(markdownParity);
    }

    const stale = checkStaleUnchangedTarget(unit, locale, sourceText, resolvedTarget);
    if (stale) {
      findings.push(stale);
    }

    const lengthExpansion = checkLengthExpansion(unit, locale, sourceText, resolvedTarget, options);
    if (lengthExpansion) {
      findings.push(lengthExpansion);
    }

    if (glossaryTerms.length > 0) {
      findings.push(
        ...checkGlossaryViolations(unit, locale, sourceText, resolvedTarget, glossaryTerms),
      );
    }
  }

  return findings;
}
