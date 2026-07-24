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
import { sanitizeAuditExcerpt } from "./parser";
import type {
  AuditCategory,
  AuditEvaluation,
  AuditFinding,
  AuditedPage,
  ExtractedPage,
  RuleEvaluation,
} from "./types";

const PLACEHOLDER_PATTERN =
  /\b(lorem ipsum|todo\b|translation missing|replace me|sample text)\b|{{[^}]+}}|\[\[[^\]]+\]\]/i;
const CURRENCY_CODE_PATTERN =
  /\b(USD|EUR|GBP|AUD|CAD|JPY|CNY|RMB|KRW|INR|BRL|MXN|CHF|SEK|NOK|DKK|NZD)\b/g;

const MARKET_CURRENCY: Record<string, string> = {
  US: "USD",
  GB: "GBP",
  AU: "AUD",
  CA: "CAD",
  JP: "JPY",
  CN: "CNY",
  KR: "KRW",
  IN: "INR",
  BR: "BRL",
  MX: "MXN",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  NZ: "NZD",
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  IE: "EUR",
  AT: "EUR",
  BE: "EUR",
  FI: "EUR",
  PT: "EUR",
};

function localeLanguage(locale: string | null | undefined): string | null {
  if (!locale || locale === "x-default") {
    return null;
  }
  try {
    return new Intl.Locale(locale).language.toLowerCase();
  } catch {
    return null;
  }
}

function localeRegion(locale: string | null | undefined): string | null {
  if (!locale || locale === "x-default") {
    return null;
  }
  try {
    return new Intl.Locale(locale).region?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

function evaluation(
  code: string,
  category: AuditCategory,
  availablePoints: number,
  earnedPoints: number,
  applicable = true,
): RuleEvaluation {
  return { code, category, availablePoints, earnedPoints, applicable };
}

function finding(
  input: Omit<AuditFinding, "confidence" | "evidenceKind" | "publicPreviewEligible"> &
    Partial<Pick<AuditFinding, "confidence" | "evidenceKind" | "publicPreviewEligible">>,
): AuditFinding {
  return {
    confidence: 1,
    evidenceKind: "observed",
    publicPreviewEligible: true,
    ...input,
    evidence: {
      ...input.evidence,
      ...(input.evidence.excerpt ? { excerpt: sanitizeAuditExcerpt(input.evidence.excerpt) } : {}),
      ...(input.evidence.observedValue
        ? { observedValue: sanitizeAuditExcerpt(input.evidence.observedValue) }
        : {}),
      ...(input.evidence.expectedValue
        ? { expectedValue: sanitizeAuditExcerpt(input.evidence.expectedValue) }
        : {}),
    },
  };
}

function addTechnicalRules(
  primary: ExtractedPage,
  pages: AuditedPage[],
  targetLocale: string,
  rules: RuleEvaluation[],
  findings: AuditFinding[],
) {
  const pageUrl = primary.url;
  const validLanguage = localeLanguage(primary.htmlLang);
  rules.push(evaluation("document_language", "technical", 12, validLanguage ? 12 : 0));
  if (!validLanguage) {
    findings.push(
      finding({
        code: "document_language",
        category: "technical",
        severity: "high",
        title: "Document language is missing or invalid",
        evidence: { observedValue: primary.htmlLang ?? "missing" },
        impact: "Browsers and assistive technology cannot reliably identify the page language.",
        recommendation: "Set a valid BCP 47 language tag on the html element.",
        availablePoints: 12,
        earnedPoints: 0,
        pageUrl,
      }),
    );
  }

  rules.push(evaluation("canonical_url", "technical", 8, primary.canonicalUrl ? 8 : 0));
  if (!primary.canonicalUrl) {
    findings.push(
      finding({
        code: "canonical_url",
        category: "technical",
        severity: "medium",
        title: "Canonical URL is missing",
        evidence: {},
        impact: "Search engines have less guidance about the preferred localized page URL.",
        recommendation: "Add a self-referencing canonical link to each locale page.",
        availablePoints: 8,
        earnedPoints: 0,
        pageUrl,
      }),
    );
  }

  const metadataPoints = (primary.title ? 4 : 0) + (primary.description ? 4 : 0);
  rules.push(evaluation("localized_metadata", "technical", 8, metadataPoints));
  if (metadataPoints < 8) {
    findings.push(
      finding({
        code: "localized_metadata",
        category: "technical",
        severity: "medium",
        title: "Search metadata is incomplete",
        evidence: {
          observedValue: [
            primary.title ? null : "title missing",
            primary.description ? null : "description missing",
          ]
            .filter(Boolean)
            .join(", "),
        },
        impact: "Incomplete metadata weakens localized search results and click-through context.",
        recommendation: "Provide a localized title and meta description.",
        availablePoints: 8,
        earnedPoints: metadataPoints,
        pageUrl,
      }),
    );
  }

  const alternatives = primary.alternateLinks.filter((item) => item.locale !== "x-default");
  rules.push(evaluation("locale_alternatives", "technical", 8, alternatives.length > 0 ? 8 : 0));
  if (alternatives.length === 0) {
    findings.push(
      finding({
        code: "locale_alternatives",
        category: "technical",
        severity: "high",
        title: "No explicit locale alternatives were found",
        evidence: {},
        impact: "Visitors and search engines cannot reliably discover equivalent locale pages.",
        recommendation: "Add alternate hreflang links or an explicit language switcher.",
        availablePoints: 8,
        earnedPoints: 0,
        pageUrl,
      }),
    );
  }

  const hasXDefault = primary.alternateLinks.some((item) => item.locale === "x-default");
  rules.push(
    evaluation("hreflang_x_default", "technical", 4, hasXDefault ? 4 : 0, alternatives.length > 0),
  );
  if (alternatives.length > 0 && !hasXDefault) {
    findings.push(
      finding({
        code: "hreflang_x_default",
        category: "technical",
        severity: "low",
        title: "No x-default locale fallback was found",
        evidence: {},
        impact: "Users without a matching locale have no declared default experience.",
        recommendation: "Add an x-default hreflang link to the appropriate fallback page.",
        availablePoints: 4,
        earnedPoints: 0,
        pageUrl,
      }),
    );
  }

  const alternativePages = pages.filter((page) => !page.isPrimary);
  const extractedAlternatives = alternativePages.filter(
    (page): page is Extract<AuditedPage, { status: "extracted" }> => page.status === "extracted",
  );
  const reciprocalCount = extractedAlternatives.filter((page) =>
    page.extracted.alternateLinks.some((link) => link.url === primary.url),
  ).length;
  const reciprocalPoints =
    extractedAlternatives.length === 0
      ? 0
      : Math.round((10 * reciprocalCount) / extractedAlternatives.length);
  rules.push(
    evaluation(
      "reciprocal_hreflang",
      "technical",
      10,
      reciprocalPoints,
      extractedAlternatives.length > 0,
    ),
  );
  if (extractedAlternatives.length > 0 && reciprocalCount < extractedAlternatives.length) {
    findings.push(
      finding({
        code: "reciprocal_hreflang",
        category: "technical",
        severity: "high",
        title: "Some locale alternatives are not reciprocal",
        evidence: {
          observedValue: `${reciprocalCount} of ${extractedAlternatives.length} checked alternatives link back`,
        },
        impact: "Incomplete hreflang clusters can be ignored or interpreted incorrectly.",
        recommendation:
          "Ensure every locale page references all equivalent pages, including itself.",
        availablePoints: 10,
        earnedPoints: reciprocalPoints,
        pageUrl,
      }),
    );
  }

  const targetLanguage = localeLanguage(targetLocale);
  const languageMatches = Boolean(
    validLanguage && targetLanguage && validLanguage === targetLanguage,
  );
  rules.push(
    evaluation(
      "target_language_alignment",
      "technical",
      8,
      languageMatches ? 8 : 0,
      Boolean(validLanguage && targetLanguage),
    ),
  );
  if (validLanguage && targetLanguage && !languageMatches) {
    findings.push(
      finding({
        code: "target_language_alignment",
        category: "technical",
        severity: "high",
        title: "Document language does not match the confirmed target locale",
        evidence: {
          observedValue: primary.htmlLang ?? undefined,
          expectedValue: targetLocale,
        },
        impact: "Language-dependent browser, accessibility, and search behavior may be incorrect.",
        recommendation: "Align the html language tag with the language of the rendered page.",
        availablePoints: 8,
        earnedPoints: 0,
        pageUrl,
      }),
    );
  }
}

function addLinguisticRules(
  primary: ExtractedPage,
  pages: AuditedPage[],
  rules: RuleEvaluation[],
  findings: AuditFinding[],
) {
  const hasEnoughCopy = primary.visibleText.length >= 120;
  const placeholderMatch = hasEnoughCopy ? primary.visibleText.match(PLACEHOLDER_PATTERN) : null;
  rules.push(
    evaluation("placeholder_copy", "linguistic", 10, placeholderMatch ? 0 : 10, hasEnoughCopy),
  );
  if (placeholderMatch) {
    findings.push(
      finding({
        code: "placeholder_copy",
        category: "linguistic",
        severity: "high",
        title: "Placeholder or unresolved copy is visible",
        evidence: { excerpt: placeholderMatch[0] },
        impact: "Unfinished copy reduces trust and can expose localization implementation details.",
        recommendation: "Replace the placeholder and verify the affected locale resource.",
        availablePoints: 10,
        earnedPoints: 0,
        pageUrl: primary.url,
      }),
    );
  }

  const comparisonPages = pages.filter(
    (page): page is Extract<AuditedPage, { status: "extracted" }> =>
      !page.isPrimary &&
      page.status === "extracted" &&
      localeLanguage(page.locale) !== localeLanguage(primary.htmlLang),
  );
  const duplicatePages = comparisonPages.filter(
    (page) => page.extracted.contentFingerprint === primary.contentFingerprint,
  );
  rules.push(
    evaluation(
      "cross_locale_copy",
      "linguistic",
      20,
      duplicatePages.length === 0 ? 20 : 0,
      comparisonPages.length > 0,
    ),
  );
  if (duplicatePages.length > 0) {
    findings.push(
      finding({
        code: "cross_locale_copy",
        category: "linguistic",
        severity: "critical",
        title: "A different-locale page has identical customer-facing content",
        evidence: { observedValue: `${duplicatePages.length} identical locale page(s)` },
        impact: "Visitors may be receiving untranslated content despite selecting another locale.",
        recommendation:
          "Publish localized copy and verify locale routing before exposing the alternative.",
        availablePoints: 20,
        earnedPoints: 0,
        pageUrl: primary.url,
      }),
    );
  }

  const comparableCtas = comparisonPages.filter(
    (page) => page.extracted.callsToAction.length > 0 && primary.callsToAction.length > 0,
  );
  const primaryCtas = new Set(primary.callsToAction.map((value) => value.toLocaleLowerCase()));
  const repeatedCtas = comparableCtas.flatMap((page) =>
    page.extracted.callsToAction.filter((value) => primaryCtas.has(value.toLocaleLowerCase())),
  );
  rules.push(
    evaluation(
      "cross_locale_cta_copy",
      "linguistic",
      10,
      repeatedCtas.length === 0 ? 10 : 0,
      comparableCtas.length > 0,
    ),
  );
  if (repeatedCtas.length > 0) {
    findings.push(
      finding({
        code: "cross_locale_cta_copy",
        category: "linguistic",
        severity: "medium",
        confidence: 0.9,
        evidenceKind: "judgement",
        title: "Calls to action repeat across different languages",
        evidence: { excerpt: repeatedCtas[0] },
        impact: "A conversion-critical action may not have been localized.",
        recommendation: "Review calls to action in context with a native-language reviewer.",
        availablePoints: 10,
        earnedPoints: 0,
        pageUrl: primary.url,
      }),
    );
  }
}

function addMarketRules(
  primary: ExtractedPage,
  pages: AuditedPage[],
  targetLocale: string,
  targetMarket: string,
  rules: RuleEvaluation[],
  findings: AuditFinding[],
) {
  const normalizedMarket = targetMarket.toUpperCase();
  const expectedCurrency = MARKET_CURRENCY[normalizedMarket];
  const currencyCodes = Array.from(new Set(primary.visibleText.match(CURRENCY_CODE_PATTERN) ?? []));
  const currencyMatches = Boolean(
    expectedCurrency && currencyCodes.length > 0 && currencyCodes.includes(expectedCurrency),
  );
  rules.push(
    evaluation(
      "market_currency",
      "market",
      12,
      currencyMatches ? 12 : 0,
      Boolean(expectedCurrency && currencyCodes.length > 0),
    ),
  );
  if (expectedCurrency && currencyCodes.length > 0 && !currencyMatches) {
    findings.push(
      finding({
        code: "market_currency",
        category: "market",
        severity: "high",
        confidence: 0.95,
        evidenceKind: "judgement",
        title: "Displayed currency does not match the confirmed market",
        evidence: {
          observedValue: currencyCodes.join(", "),
          expectedValue: expectedCurrency,
        },
        impact: "Unexpected pricing currency can create friction and reduce purchase confidence.",
        recommendation: "Confirm pricing and currency presentation for the selected market.",
        availablePoints: 12,
        earnedPoints: 0,
        pageUrl: primary.url,
      }),
    );
  }

  const targetRegion = localeRegion(targetLocale);
  const regionMatches = Boolean(targetRegion && targetRegion === normalizedMarket);
  rules.push(
    evaluation(
      "locale_market_alignment",
      "market",
      8,
      regionMatches ? 8 : 0,
      Boolean(targetRegion),
    ),
  );
  if (targetRegion && !regionMatches) {
    findings.push(
      finding({
        code: "locale_market_alignment",
        category: "market",
        severity: "medium",
        title: "Locale region and target market differ",
        evidence: {
          observedValue: targetLocale,
          expectedValue: normalizedMarket,
        },
        impact:
          "Regional spelling, formats, legal copy, and offers may not fit the intended market.",
        recommendation: "Confirm that the selected locale variant is intentional for this market.",
        availablePoints: 8,
        earnedPoints: 0,
        pageUrl: primary.url,
      }),
    );
  }

  const comparisonPages = pages.filter(
    (page): page is Extract<AuditedPage, { status: "extracted" }> =>
      !page.isPrimary && page.status === "extracted",
  );
  const comparableMetadata = comparisonPages.filter((page) =>
    Boolean(primary.title && page.extracted.title),
  );
  const duplicateMetadata = comparableMetadata.filter(
    (page) =>
      page.extracted.title?.toLocaleLowerCase() === primary.title?.toLocaleLowerCase() &&
      page.locale !== primary.htmlLang,
  );
  rules.push(
    evaluation(
      "localized_search_metadata",
      "market",
      10,
      duplicateMetadata.length === 0 ? 10 : 0,
      comparableMetadata.length > 0,
    ),
  );
  if (duplicateMetadata.length > 0) {
    findings.push(
      finding({
        code: "localized_search_metadata",
        category: "market",
        severity: "medium",
        confidence: 0.9,
        evidenceKind: "judgement",
        title: "Page titles repeat across locale pages",
        evidence: { excerpt: primary.title ?? undefined },
        impact: "Repeated titles may not reflect local search language or intent.",
        recommendation: "Research and localize the title for each target market.",
        availablePoints: 10,
        earnedPoints: 0,
        pageUrl: primary.url,
      }),
    );
  }
}

export function evaluateLocalisationAudit(input: {
  pages: AuditedPage[];
  targetLocale: string;
  targetMarket: string;
}): AuditEvaluation {
  const primaryPage = input.pages.find(
    (page): page is Extract<AuditedPage, { status: "extracted" }> =>
      page.isPrimary && page.status === "extracted",
  );
  if (!primaryPage) {
    return {
      findings: [],
      rules: [],
      limitations: ["The submitted page could not be extracted."],
    };
  }

  const findings: AuditFinding[] = [];
  const rules: RuleEvaluation[] = [];
  addTechnicalRules(primaryPage.extracted, input.pages, input.targetLocale, rules, findings);
  addLinguisticRules(primaryPage.extracted, input.pages, rules, findings);
  addMarketRules(
    primaryPage.extracted,
    input.pages,
    input.targetLocale,
    input.targetMarket,
    rules,
    findings,
  );

  const failedAlternatives = input.pages.filter(
    (page) => !page.isPrimary && page.status !== "extracted",
  );
  const limitations =
    failedAlternatives.length > 0
      ? [
          `${failedAlternatives.length} explicit locale alternative(s) could not be extracted; comparison checks exclude them.`,
        ]
      : [];

  return {
    findings: findings.toSorted(
      (left, right) =>
        ["info", "low", "medium", "high", "critical"].indexOf(right.severity) -
          ["info", "low", "medium", "high", "critical"].indexOf(left.severity) ||
        left.code.localeCompare(right.code),
    ),
    rules,
    limitations,
  };
}
