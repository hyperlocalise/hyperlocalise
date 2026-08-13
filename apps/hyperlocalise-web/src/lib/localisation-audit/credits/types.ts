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
  LocalisationAuditCrawledPage,
  LocalisationAuditCreditResult,
  LocalisationAuditDimension,
  LocalisationAuditFinding,
  LocalisationAuditLocaleSignal,
  LocalisationAuditSitemapSignal,
} from "../types";

export type CreditMode = "heuristic" | "luna" | "hybrid" | "na";

export type LocalisationAuditCreditDefinition = {
  id: string;
  dimension: LocalisationAuditDimension;
  title: string;
  mode: CreditMode;
  rubric: string;
};

export type AuditCreditContext = {
  pages: LocalisationAuditCrawledPage[];
  focusLocales: string[];
  detectedLocales: LocalisationAuditLocaleSignal[];
  sitemap: LocalisationAuditSitemapSignal;
};

export type HeuristicCreditOutcome =
  | { status: "scored"; score: number; findings: LocalisationAuditFinding[] }
  | {
      status: "inconclusive";
      findings?: LocalisationAuditFinding[];
      evidence?: Record<string, unknown>;
    }
  | { status: "na" };

export type HeuristicScorer = (context: AuditCreditContext) => HeuristicCreditOutcome;

export type LunaCreditInput = {
  id: string;
  dimension: LocalisationAuditDimension;
  title: string;
  rubric: string;
  evidence: Record<string, unknown>;
  heuristicFindings: LocalisationAuditFinding[];
};

export type CreditRunResult = {
  credits: LocalisationAuditCreditResult[];
  findings: LocalisationAuditFinding[];
  detectedLocales: LocalisationAuditLocaleSignal[];
  linguisticNotes: Array<{
    locale: string;
    summary: string;
    samples: Array<{ text: string; note: string }>;
  }>;
};
