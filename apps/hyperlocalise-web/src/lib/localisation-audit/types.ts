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

export type LocalisationAuditStatus = "queued" | "running" | "succeeded" | "failed";

export type LocalisationAuditProgressStage =
  | "queued"
  | "preparing"
  | "crawling"
  | "analyzing"
  | "scoring"
  | "completed"
  | "failed";

export type LocalisationAuditFindingSeverity = "critical" | "warning" | "info";

export type LocalisationAuditFindingCategory = "technical" | "linguistic";

export type LocalisationAuditFinding = {
  id: string;
  category: LocalisationAuditFindingCategory;
  severity: LocalisationAuditFindingSeverity;
  title: string;
  summary: string;
  url?: string;
  evidence?: string;
};

export type LocalisationAuditLocaleSignal = {
  locale: string;
  source: "hreflang" | "html_lang" | "url_prefix" | "url_subdomain" | "focus";
  sampleUrl?: string;
};

export type LocalisationAuditCrawledPage = {
  url: string;
  finalUrl?: string;
  status: number;
  htmlLang: string | null;
  title: string | null;
  textSample: string;
  hreflang: Array<{ locale: string; href: string }>;
};

export type LocalisationAuditTeaser = {
  score: number;
  domainKey: string;
  domainSlug: string;
  detectedLocales: LocalisationAuditLocaleSignal[];
  headlineFindings: LocalisationAuditFinding[];
  pagesCrawled: number;
  completedAt: string;
};

export type LocalisationAuditReport = {
  score: number;
  domainKey: string;
  domainSlug: string;
  sourceUrl: string;
  focusLocales: string[];
  detectedLocales: LocalisationAuditLocaleSignal[];
  findings: LocalisationAuditFinding[];
  pages: Array<{
    url: string;
    status: number;
    htmlLang: string | null;
    title: string | null;
  }>;
  linguisticNotes: Array<{
    locale: string;
    summary: string;
    samples: Array<{ text: string; note: string }>;
  }>;
  pagesCrawled: number;
  completedAt: string;
};

export type LocalisationAuditEventData = {
  auditId: string;
  attemptNumber: number;
};

export type LocalisationAuditReportEmailEventData = {
  leadId: string;
  /** Opaque one-time token; never log. Optional when the send step must mint a replacement. */
  token?: string;
};

export type LocalisationAuditLeadDeliveryStatus =
  | "pending"
  | "queued"
  | "sent"
  | "failed"
  | "verified";

export const LOCALISATION_AUDIT_STALE_MS = 15 * 60 * 1000;
export const LOCALISATION_AUDIT_EMAIL_RESEND_COOLDOWN_MS = 60 * 1000;
export const LOCALISATION_AUDIT_REPORT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
