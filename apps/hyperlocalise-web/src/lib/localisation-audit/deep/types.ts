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
  LocalisationAuditDimensionScores,
  LocalisationAuditFindingSeverity,
  LocalisationAuditLocaleSignal,
} from "../types";

export type LocalisationDeepAuditStatus =
  | "queued"
  | "crawling"
  | "scoring"
  | "succeeded"
  | "failed"
  | "cancelled";

export const LOCALISATION_DEEP_AUDIT_IN_FLIGHT_STATUSES = [
  "queued",
  "crawling",
  "scoring",
] as const satisfies readonly LocalisationDeepAuditStatus[];

export type LocalisationDeepAuditTrigger = "manual" | "scheduled";

/** Whether a finding also existed, by fingerprint, in the previous succeeded run. */
export type LocalisationDeepAuditDiffState = "new" | "unchanged";

/** Pages rendered per sandbox session. One Chromium visits them in sequence. */
export const LOCALISATION_DEEP_AUDIT_BATCH_SIZE = 20;

/** Default page budget until plan-based limits exist. */
export const LOCALISATION_DEEP_AUDIT_DEFAULT_PAGE_LIMIT = 100;

/** Stop the crawl when this share of a batch is blocked (403/429 or a challenge page). */
export const LOCALISATION_DEEP_AUDIT_BLOCKED_BATCH_SHARE = 0.5;

export type LocalisationDeepAuditTemplateSummary = {
  key: string;
  pages: number;
  locales: string[];
};

export type LocalisationDeepAuditCreditStats = {
  affectedPages: number;
  affectedTemplates: number;
};

export type LocalisationDeepAuditDiffSummary = {
  new: number;
  unchanged: number;
  fixed: number;
};

export type LocalisationDeepAuditSummary = {
  credits: LocalisationAuditCreditResult[];
  creditStats: Record<string, LocalisationDeepAuditCreditStats>;
  detectedLocales: LocalisationAuditLocaleSignal[];
  localeCoverageFactor: number;
  templates: LocalisationDeepAuditTemplateSummary[];
  pagesCrawled: number;
  findingsCount: number;
  /** Null on the first succeeded run for a domain. */
  diff: LocalisationDeepAuditDiffSummary | null;
  linguisticNotes: Array<{
    locale: string;
    summary: string;
    samples: Array<{ text: string; note: string }>;
  }>;
};

export type LocalisationDeepAuditEventData = {
  runId: string;
};

/** Wire shapes returned by go-svc for the Audit tab. */
export type LocalisationDeepAuditRun = {
  id: string;
  linkedDomainId: string;
  status: LocalisationDeepAuditStatus;
  trigger: LocalisationDeepAuditTrigger;
  pageLimit: number;
  pagesDiscovered: number;
  pagesRendered: number;
  score: number | null;
  dimensionScores: LocalisationAuditDimensionScores | null;
  summary: LocalisationDeepAuditSummary | null;
  previousRunId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

/** Runs history item: the summary is left out, the diff and count are lifted from it. */
export type LocalisationDeepAuditRunListItem = LocalisationDeepAuditRun & {
  diff: LocalisationDeepAuditDiffSummary | null;
  findingsCount: number | null;
};

export type LocalisationDeepAuditFindingQuery = {
  creditId?: string;
  severity?: LocalisationAuditFindingSeverity;
  templateKey?: string;
  locale?: string;
  diff?: LocalisationDeepAuditDiffState | "fixed";
  limit?: number;
  offset?: number;
};

export type LocalisationDeepAuditDetailResponse = {
  deepAudit: LocalisationDeepAuditRun;
  findings: LocalisationDeepAuditFindingRow[];
  findingsTotal: number;
  limit: number;
  offset: number;
};

export type LocalisationDeepAuditFindingRow = {
  id: string;
  creditId: string;
  dimension: string;
  severity: LocalisationAuditFindingSeverity;
  title: string;
  summary: string;
  url: string | null;
  templateKey: string | null;
  locale: string | null;
  location: string | null;
  evidence: string | null;
  advice: string | null;
  confidence: number | null;
  diffState: LocalisationDeepAuditDiffState | "fixed";
};

export type LocalisationDeepAuditPageRow = {
  id: string;
  url: string;
  finalUrl: string;
  httpStatus: number;
  locale: string | null;
  templateKey: string;
};
