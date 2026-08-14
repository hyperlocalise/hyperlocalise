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
import type { LocalisationAuditFinding } from "../../types";
import {
  clampScore,
  clipFindingEvidence,
  creditFinding,
  dominantScript,
  formatFindingWhere,
  groupPagesByLanguage,
  isCjkLanguage,
  isLatinScriptLanguage,
  isRtlLanguage,
  languageOf,
  looksLikeUrlOrEmail,
  looksPrimarilyEnglish,
  pageLocale,
  sourceLanguage,
} from "../shared";
import type { HeuristicCreditOutcome, HeuristicScorer } from "../types";

function scored(score: number, findings: LocalisationAuditFinding[]): HeuristicCreditOutcome {
  return { status: "scored", score: clampScore(score), findings };
}

const scoreTranslationCompleteness: HeuristicScorer = (context) => {
  const source = sourceLanguage(context.detectedLocales);
  const findings: LocalisationAuditFinding[] = [];
  let score = 100;
  let latinAmbiguous = false;

  for (const page of context.pages) {
    if (page.status < 200 || page.status >= 400) continue;
    const locale = pageLocale(page);
    if (!locale || languageOf(locale) === source) continue;
    const text = page.textSample;
    if (looksLikeUrlOrEmail(text) || text.length < 40) continue;

    if (
      isCjkLanguage(locale) ||
      isRtlLanguage(locale) ||
      ["ru", "uk", "bg", "el", "th"].includes(languageOf(locale))
    ) {
      const script = dominantScript(text);
      const expected = isCjkLanguage(locale)
        ? "cjk"
        : isRtlLanguage(locale)
          ? languageOf(locale) === "he"
            ? "hebrew"
            : "arabic"
          : languageOf(locale) === "th"
            ? "thai"
            : "cyrillic";
      if (script === "latin" && looksPrimarilyEnglish(text)) {
        score -= 28;
        findings.push(
          creditFinding({
            id: `completeness-untranslated-${findings.length}`,
            creditId: "translation-completeness",
            category: "linguistic",
            severity: "critical",
            title: "Locale URL still looks English",
            summary: `Content on a ${locale} URL appears primarily English in the sampled text.`,
            where: formatFindingWhere({ section: "Page body", tag: "sampled copy" }),
            url: page.url,
            evidence: clipFindingEvidence(text),
            advice: `Translate the leftover English copy on this ${locale} page.`,
            confidence: 96,
          }),
        );
      } else if (script !== expected && script === "latin") {
        score -= 20;
        findings.push(
          creditFinding({
            id: `completeness-script-${findings.length}`,
            creditId: "translation-completeness",
            category: "linguistic",
            severity: "high",
            title: "Page script does not match the locale",
            summary: `A ${locale} page is dominated by Latin-script copy.`,
            where: formatFindingWhere({ section: "Page body", tag: "sampled copy" }),
            url: page.url,
            evidence: clipFindingEvidence(text),
            advice: `Write this ${locale} page in the expected script instead of leftover Latin-script copy.`,
          }),
        );
      }
      continue;
    }

    if (isLatinScriptLanguage(locale)) {
      const sourcePages = groupPagesByLanguage(context.pages).get(source) ?? [];
      const sourceCtas = sourcePages.flatMap((item) => [
        ...item.buttons,
        ...item.anchors.map((a) => a.text),
      ]);
      const overlap = [...page.buttons, ...page.anchors.map((anchor) => anchor.text)].filter(
        (textValue) =>
          textValue.length >= 8 &&
          sourceCtas.includes(textValue) &&
          !looksLikeUrlOrEmail(textValue),
      );
      if (overlap.length > 0) {
        score -= 22;
        findings.push(
          creditFinding({
            id: `completeness-cta-${findings.length}`,
            creditId: "translation-completeness",
            category: "linguistic",
            severity: "high",
            title: "Untranslated call to action",
            summary: `A ${locale} page still uses source-language CTA copy.`,
            where: formatFindingWhere({ section: "Pricing hero", tag: "<button>" }),
            url: page.url,
            evidence: `Primary CTA: "${overlap[0]}"`,
            advice: "Translate leftover source-language CTAs to match the surrounding locale copy.",
            confidence: 92,
          }),
        );
      } else {
        latinAmbiguous = true;
      }
    }
  }

  if (latinAmbiguous) {
    return {
      status: "inconclusive",
      findings,
      evidence: { reason: "latin_script_locale_needs_review" },
    };
  }
  return scored(score, findings);
};

const scoreTerminologyConsistency: HeuristicScorer = (context) => {
  const source = sourceLanguage(context.detectedLocales);
  const sourceTerms = new Set<string>();
  for (const page of groupPagesByLanguage(context.pages).get(source) ?? []) {
    for (const term of [...page.buttons, ...page.headings, ...page.anchors.map((a) => a.text)]) {
      const normalized = term.trim();
      if (normalized.length >= 4 && normalized.length <= 40) {
        sourceTerms.add(normalized);
      }
    }
  }
  if (sourceTerms.size === 0) {
    return { status: "inconclusive", evidence: { reason: "no_source_terms" } };
  }

  const findings: LocalisationAuditFinding[] = [];
  for (const [language, pages] of groupPagesByLanguage(context.pages)) {
    if (language === source) continue;
    const seen = new Map<string, Set<string>>();
    for (const page of pages) {
      for (const term of [...page.buttons, ...page.headings]) {
        for (const sourceTerm of sourceTerms) {
          if (term === sourceTerm) {
            const variants = seen.get(sourceTerm) ?? new Set();
            variants.add(term);
            seen.set(sourceTerm, variants);
          }
        }
      }
    }
    for (const [sourceTerm, variants] of seen) {
      const translatedSomewhere = pages.some((page) =>
        [...page.buttons, ...page.headings].some(
          (term) =>
            term !== sourceTerm &&
            term.toLowerCase().includes(sourceTerm.toLowerCase().slice(0, 4)),
        ),
      );
      if (variants.has(sourceTerm) && translatedSomewhere) {
        findings.push(
          creditFinding({
            id: `terminology-${findings.length}`,
            creditId: "terminology-consistency",
            category: "linguistic",
            severity: "medium",
            title: "Terminology inconsistency",
            summary: `"${sourceTerm}" appears both untranslated and translated across ${language} pages.`,
            where: formatFindingWhere({ section: "Header", tag: "<nav> or <button>" }),
            url: pages[0]?.url,
            evidence: `"${sourceTerm}" appears untranslated on some ${language} pages and translated on others`,
            advice: `Use one translated label for "${sourceTerm}" across ${language} pages.`,
          }),
        );
      }
    }
  }

  if (findings.length === 0) {
    return { status: "inconclusive", evidence: { reason: "no_clear_term_clusters" } };
  }
  return scored(Math.max(40, 88 - findings.length * 12), findings);
};

const scoreCrossPageConsistency: HeuristicScorer = () => {
  // Nav-label variance across pages is usually noise for lead-gen audits
  // (e.g. "Digital gov" vs "Digital GOV") and is not scored here.
  return { status: "na" };
};

const lunaOnly: HeuristicScorer = () => ({ status: "inconclusive" });

export const linguisticHeuristicScorers: Record<string, HeuristicScorer> = {
  "translation-completeness": scoreTranslationCompleteness,
  "terminology-consistency": scoreTerminologyConsistency,
  "cross-page-consistency": scoreCrossPageConsistency,
  "translation-accuracy": lunaOnly,
  fluency: lunaOnly,
  "brand-voice": lunaOnly,
  "grammar-and-style": lunaOnly,
};
