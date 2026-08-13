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
import type {
  LocalisationAuditCreditResult,
  LocalisationAuditFinding,
  LocalisationAuditSitemapSignal,
} from "../types";
import { EMPTY_SITEMAP_SIGNAL } from "../types";
import { LOCALISATION_AUDIT_CREDITS } from "./catalog";
import { contextualHeuristicScorers } from "./heuristics/contextual";
import { linguisticHeuristicScorers } from "./heuristics/linguistic";
import { technicalHeuristicScorers } from "./heuristics/technical";
import { visualHeuristicScorers } from "./heuristics/visual";
import { scoreCreditsWithLuna } from "./luna";
import { detectLocales } from "./shared";
import type {
  AuditCreditContext,
  CreditRunResult,
  HeuristicScorer,
  LunaCreditInput,
} from "./types";

const heuristicScorers: Record<string, HeuristicScorer> = {
  ...technicalHeuristicScorers,
  ...linguisticHeuristicScorers,
  ...contextualHeuristicScorers,
  ...visualHeuristicScorers,
};

function compactPageEvidence(context: AuditCreditContext): Record<string, unknown> {
  return {
    locales: context.detectedLocales.map((entry) => entry.locale),
    pages: context.pages.slice(0, 8).map((page) => ({
      url: page.url,
      status: page.status,
      htmlLang: page.htmlLang,
      title: page.title,
      dir: page.dir,
      buttons: page.buttons.slice(0, 6),
      headings: page.headings.slice(0, 4),
      text: page.textSample.slice(0, 280),
    })),
  };
}

export async function runLocalisationAuditCredits(input: {
  pages: AuditCreditContext["pages"];
  focusLocales: string[];
  sitemap?: LocalisationAuditSitemapSignal;
}): Promise<CreditRunResult> {
  const detectedLocales = detectLocales(input.pages, input.focusLocales);
  const context: AuditCreditContext = {
    pages: input.pages,
    focusLocales: input.focusLocales,
    detectedLocales,
    sitemap: input.sitemap ?? EMPTY_SITEMAP_SIGNAL,
  };

  const credits: LocalisationAuditCreditResult[] = [];
  const findings: LocalisationAuditFinding[] = [];
  const lunaInputs: LunaCreditInput[] = [];

  for (const definition of LOCALISATION_AUDIT_CREDITS) {
    const scorer = heuristicScorers[definition.id];
    const outcome = scorer ? scorer(context) : { status: "inconclusive" as const };

    if (outcome.status === "na" || definition.mode === "na") {
      credits.push({
        id: definition.id,
        dimension: definition.dimension,
        score: null,
        method: "na",
      });
      continue;
    }

    if (outcome.status === "scored") {
      credits.push({
        id: definition.id,
        dimension: definition.dimension,
        score: outcome.score,
        method: "heuristic",
      });
      findings.push(...outcome.findings);
      continue;
    }

    lunaInputs.push({
      id: definition.id,
      dimension: definition.dimension,
      title: definition.title,
      rubric: definition.rubric,
      evidence: {
        ...compactPageEvidence(context),
        ...outcome.evidence,
      },
      heuristicFindings: outcome.findings ?? [],
    });
    if (outcome.findings) {
      findings.push(...outcome.findings);
    }
  }

  const luna = await scoreCreditsWithLuna({ credits: lunaInputs });
  const lunaById = new Map(luna.credits.map((credit) => [credit.id, credit]));

  for (const pending of lunaInputs) {
    const scored = lunaById.get(pending.id);
    if (!scored) {
      credits.push({
        id: pending.id,
        dimension: pending.dimension,
        score: null,
        method: "na",
      });
      continue;
    }
    credits.push({
      id: pending.id,
      dimension: pending.dimension,
      score: scored.score,
      method: "luna",
    });
    findings.push(...scored.findings);
  }

  const catalogOrder = new Map(
    LOCALISATION_AUDIT_CREDITS.map((credit, index) => [credit.id, index]),
  );
  credits.sort((a, b) => (catalogOrder.get(a.id) ?? 0) - (catalogOrder.get(b.id) ?? 0));

  return {
    credits,
    findings,
    detectedLocales,
    linguisticNotes: luna.linguisticNotes,
  };
}
