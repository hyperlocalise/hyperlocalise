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
  formatFindingWhere,
  groupPagesByLanguage,
  languageOf,
  pageLocale,
  passingShareScore,
  sourceLanguage,
} from "../shared";
import type { HeuristicCreditOutcome, HeuristicScorer } from "../types";

function scored(score: number, findings: LocalisationAuditFinding[]): HeuristicCreditOutcome {
  return { status: "scored", score: clampScore(score), findings };
}

function hasComparableSourceTarget(context: Parameters<HeuristicScorer>[0]): boolean {
  const grouped = groupPagesByLanguage(context.pages);
  return grouped.size >= 2;
}

const CTA_HINT =
  /get started|sign up|subscribe|buy now|book now|free trial|upgrade|save changes|delete account|continue|learn more|commencer|s'abonner|jetzt starten|kostenlos/i;

const scoreCtaIntent: HeuristicScorer = (context) => {
  const candidates = context.pages.flatMap((page) =>
    [...page.buttons, ...page.anchors.map((anchor) => anchor.text)].filter(
      (text) => text.length >= 3 && text.length <= 48 && CTA_HINT.test(text),
    ),
  );
  if (candidates.length === 0) {
    return { status: "na" };
  }
  return {
    status: "inconclusive",
    evidence: { ctas: candidates.slice(0, 12) },
  };
};

/** International phone number, e.g. +44 20 7946 0958. */
const INTERNATIONAL_PHONE_RE = /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}/;
/** US/NANP phone, e.g. +1 (415) 555-0100 or (415) 555-0100. */
const US_PHONE_RE = /\+1[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\(\d{3}\)\s?\d{3}-\d{4}/;

/** Markets that share the +1 country code, where a +1 number is local (e.g. fr-CA). */
const NANP_REGIONS = new Set(["us", "ca", "pr", "do", "jm", "tt", "bs", "bb"]);

/**
 * Contact details on localized pages should fit the market. Currency is scored by
 * international-formatting, so it is not counted again here.
 */
const scoreCulturalAdaptation: HeuristicScorer = (context) => {
  const source = sourceLanguage(context.detectedLocales);
  const findings: LocalisationAuditFinding[] = [];
  const failingPages = new Set<string>();
  let inspected = 0;
  for (const page of context.pages) {
    const locale = pageLocale(page);
    if (!locale) continue;
    const language = languageOf(locale);
    if (language === source || language === "en") continue;
    const text = page.textSample;
    const region = locale.split("-")[1] ?? "";
    const usPhone = NANP_REGIONS.has(region) ? undefined : text.match(US_PHONE_RE)?.[0];
    if (!usPhone && !INTERNATIONAL_PHONE_RE.test(text)) continue;
    inspected += 1;
    if (!usPhone) continue;
    failingPages.add(page.url);
    findings.push(
      creditFinding({
        id: `cultural-${findings.length}`,
        creditId: "cultural-adaptation",
        category: "contextual",
        severity: "medium",
        title: "US contact details on a localized page",
        summary: `A ${language} page lists a US phone number instead of a local contact.`,
        where: formatFindingWhere({ section: "Page body", tag: "sampled copy" }),
        url: page.url,
        evidence: clipFindingEvidence(usPhone),
        advice: "Show a local or international contact number for this market.",
        confidence: 78,
      }),
    );
  }
  if (inspected === 0) {
    return { status: "na" };
  }
  return scored(passingShareScore(inspected, failingPages.size), findings);
};

const needsSourceTarget: HeuristicScorer = (context) => {
  if (!hasComparableSourceTarget(context)) {
    return { status: "na" };
  }
  const source = sourceLanguage(context.detectedLocales);
  const samples = [...groupPagesByLanguage(context.pages).entries()].flatMap(([language, pages]) =>
    pages.slice(0, 2).map((page) => ({
      language,
      url: page.url,
      title: page.title,
      buttons: page.buttons.slice(0, 6),
      headings: page.headings.slice(0, 4),
      text: page.textSample.slice(0, 400),
      isSource: language === source,
    })),
  );
  return { status: "inconclusive", evidence: { samples } };
};

const alwaysNa: HeuristicScorer = () => ({ status: "na" });

export const contextualHeuristicScorers: Record<string, HeuristicScorer> = {
  "cta-intent": scoreCtaIntent,
  "cultural-adaptation": scoreCulturalAdaptation,
  "ui-context": needsSourceTarget,
  "product-context": needsSourceTarget,
  "contextual-meaning": needsSourceTarget,
  "audience-context": needsSourceTarget,
  "glossary-compliance": alwaysNa,
  "translation-memory": alwaysNa,
};
