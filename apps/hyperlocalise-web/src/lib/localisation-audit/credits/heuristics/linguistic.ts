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
  isPlausibleCtaCopy,
  isRtlLanguage,
  languageOf,
  looksLikeUrlOrEmail,
  looksPrimarilyEnglish,
  pageLocale,
  passingShareScore,
  sourceLanguage,
} from "../shared";
import type { HeuristicCreditOutcome, HeuristicScorer } from "../types";

function scored(score: number, findings: LocalisationAuditFinding[]): HeuristicCreditOutcome {
  return { status: "scored", score: clampScore(score), findings };
}

function ctaCandidates(page: { buttons: string[]; anchors: Array<{ text: string }> }): Array<{
  text: string;
  tag: "<button>" | "<a>";
}> {
  const seen = new Set<string>();
  const candidates: Array<{ text: string; tag: "<button>" | "<a>" }> = [];
  const push = (text: string, tag: "<button>" | "<a>") => {
    if (!isPlausibleCtaCopy(text) || seen.has(text)) {
      return;
    }
    seen.add(text);
    candidates.push({ text, tag });
  };
  for (const text of page.buttons) {
    push(text, "<button>");
  }
  for (const anchor of page.anchors) {
    push(anchor.text, "<a>");
  }
  return candidates;
}

const scoreTranslationCompleteness: HeuristicScorer = (context) => {
  const source = sourceLanguage(context.detectedLocales);
  const findings: LocalisationAuditFinding[] = [];
  const failingPages = new Set<string>();
  let inspected = 0;
  let latinAmbiguous = false;
  const sourcePages = groupPagesByLanguage(context.pages).get(source) ?? [];
  const sourceCtas = new Set(
    sourcePages.flatMap((item) => ctaCandidates(item).map((cta) => cta.text)),
  );

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
      inspected += 1;
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
        failingPages.add(page.url);
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
        failingPages.add(page.url);
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
      const pageCtas = ctaCandidates(page);
      // Latin-script copy cannot be judged by script; compare CTAs against the source instead.
      if (sourceCtas.size === 0 || pageCtas.length === 0) {
        latinAmbiguous = true;
        continue;
      }
      inspected += 1;
      const overlap = pageCtas.filter((cta) => sourceCtas.has(cta.text));
      if (overlap.length > 0) {
        const primary = overlap[0]!;
        failingPages.add(page.url);
        findings.push(
          creditFinding({
            id: `completeness-cta-${findings.length}`,
            creditId: "translation-completeness",
            category: "linguistic",
            severity: "high",
            title: "Untranslated call to action",
            summary: `A ${locale} page still uses source-language CTA copy.`,
            where: formatFindingWhere({
              section: primary.tag === "<button>" ? "Primary action" : "Link",
              tag: primary.tag,
            }),
            url: page.url,
            evidence: clipFindingEvidence(`Primary CTA: "${primary.text}"`),
            advice: "Translate leftover source-language CTAs to match the surrounding locale copy.",
            confidence: 92,
          }),
        );
      }
    }
  }

  if (inspected === 0) {
    return latinAmbiguous
      ? {
          status: "inconclusive",
          findings,
          evidence: { reason: "latin_script_locale_needs_review" },
        }
      : { status: "na" };
  }
  return scored(passingShareScore(inspected, failingPages.size), findings);
};

/** Global chrome labels (nav, footer, buttons) must repeat on this many source pages. */
const TERMINOLOGY_MIN_PAGES = 2;
/** Pages with fewer links than this are landing pages without the shared chrome. */
const TERMINOLOGY_MIN_CHROME_LINKS = 5;

function chromeLabels(page: { buttons: string[]; anchors: Array<{ text: string }> }): Set<string> {
  return new Set(
    [...page.buttons, ...page.anchors.map((anchor) => anchor.text)]
      .map((label) => label.replace(/\s+/g, " ").trim())
      .filter((label) => label.length >= 4 && label.length <= 40 && /\p{L}/u.test(label)),
  );
}

/**
 * A label shown on every sampled source page is site chrome. If a target locale
 * shows that exact source label on some of its pages but not others, the label
 * is translated in one place and left in the source language elsewhere.
 * Brand names stay consistent everywhere, so they do not trigger this.
 */
const scoreTerminologyConsistency: HeuristicScorer = (context) => {
  const source = sourceLanguage(context.detectedLocales);
  const grouped = groupPagesByLanguage(
    context.pages.filter(
      (page) =>
        page.status >= 200 &&
        page.status < 400 &&
        page.anchors.length >= TERMINOLOGY_MIN_CHROME_LINKS,
    ),
  );
  const sourcePages = grouped.get(source) ?? [];
  if (sourcePages.length < TERMINOLOGY_MIN_PAGES) {
    return { status: "na" };
  }
  const [firstSource, ...restSource] = sourcePages.map(chromeLabels);
  const sharedSourceLabels = [...firstSource!].filter((label) =>
    restSource.every((labels) => labels.has(label)),
  );

  const findings: LocalisationAuditFinding[] = [];
  let inspectedLanguages = 0;
  for (const [language, pages] of grouped) {
    if (language === source || pages.length < TERMINOLOGY_MIN_PAGES) continue;
    inspectedLanguages += 1;
    const labelsByPage = pages.map((page) => ({ page, labels: chromeLabels(page) }));
    for (const label of sharedSourceLabels) {
      const withLabel = labelsByPage.filter((entry) => entry.labels.has(label));
      if (withLabel.length === 0 || withLabel.length === labelsByPage.length) continue;
      const without = labelsByPage.find((entry) => !entry.labels.has(label));
      findings.push(
        creditFinding({
          id: `terminology-${findings.length}`,
          creditId: "terminology-consistency",
          category: "linguistic",
          severity: "medium",
          title: "Terminology inconsistency",
          summary: `"${label}" stays in the source language on ${withLabel.length} of ${labelsByPage.length} ${language} pages and is translated on the rest.`,
          where: formatFindingWhere({
            section: "Site chrome",
            tag: "<nav>, <footer>, or <button>",
          }),
          url: withLabel[0]?.page.url,
          evidence: clipFindingEvidence(
            `"${label}" on ${withLabel[0]?.page.url}; absent on ${without?.page.url}`,
          ),
          advice: `Use one translated label for "${label}" across all ${language} pages.`,
          confidence: 85,
        }),
      );
    }
  }

  if (inspectedLanguages === 0) {
    return { status: "na" };
  }
  return scored(
    passingShareScore(Math.max(sharedSourceLabels.length * inspectedLanguages, 1), findings.length),
    findings,
  );
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
