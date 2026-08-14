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

const scoreCulturalAdaptation: HeuristicScorer = (context) => {
  const findings: LocalisationAuditFinding[] = [];
  let sawSignal = false;
  for (const page of context.pages) {
    const locale = pageLocale(page);
    if (!locale) continue;
    const language = languageOf(locale);
    const text = page.textSample;
    const hasUsPhone = /\+?1[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(text);
    const hasUsZip = /\b\d{5}(?:-\d{4})?\b/.test(text);
    if (language !== "en" && (hasUsPhone || /\$\d/.test(text))) {
      sawSignal = true;
      findings.push(
        creditFinding({
          id: `cultural-${findings.length}`,
          creditId: "cultural-adaptation",
          category: "contextual",
          severity: "medium",
          title: "Possible cultural adaptation gap",
          summary: `A ${language} page still uses US-style currency or contact details.`,
          where: formatFindingWhere({ section: "Page body", tag: "sampled copy" }),
          url: page.url,
          evidence: clipFindingEvidence(
            text.match(/\$\d[\d,.]*/)?.[0] ??
              text.match(/\+?1[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0] ??
              text.slice(0, 200),
          ),
          advice:
            "Use locale-appropriate currency and contact formats instead of US-style defaults.",
          confidence: 78,
        }),
      );
    }
    if (language === "en" && hasUsZip) {
      sawSignal = true;
    }
  }
  if (findings.length > 0) {
    return scored(Math.max(50, 80 - findings.length * 10), findings);
  }
  if (!sawSignal) {
    return { status: "inconclusive", evidence: { reason: "no_cultural_signals" } };
  }
  return scored(88, findings);
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
