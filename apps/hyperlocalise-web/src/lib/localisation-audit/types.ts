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
export const LOCALISATION_AUDIT_SCORE_VERSION = "2026-07-24.1";
export const LOCALISATION_AUDIT_REPORT_VERSION = "1";

export type AuditCategory = "technical" | "linguistic" | "market";
export type AuditSeverity = "info" | "low" | "medium" | "high" | "critical";
export type AuditEvidenceKind = "observed" | "judgement";
export type AuditCompletionStatus = "completed" | "partial";

export type DiscoveredLocaleAlternative = {
  locale: string;
  url: string;
  source: "hreflang" | "language_link";
};

export type ExtractedPage = {
  url: string;
  htmlLang: string | null;
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  alternateLinks: DiscoveredLocaleAlternative[];
  headings: string[];
  navigation: string[];
  callsToAction: string[];
  visibleText: string;
  contentFingerprint: string;
};

export type AuditedPage =
  | {
      url: string;
      locale: string | null;
      isPrimary: boolean;
      status: "extracted";
      httpStatus: number;
      extracted: ExtractedPage;
    }
  | {
      url: string;
      locale: string | null;
      isPrimary: boolean;
      status: "blocked" | "failed";
      failureCode: string;
      httpStatus?: number;
    };

export type FindingEvidence = {
  excerpt?: string;
  observedValue?: string;
  expectedValue?: string;
};

export type AuditFinding = {
  code: string;
  category: AuditCategory;
  severity: AuditSeverity;
  confidence: number;
  evidenceKind: AuditEvidenceKind;
  title: string;
  evidence: FindingEvidence;
  impact: string;
  recommendation: string;
  availablePoints: number;
  earnedPoints: number;
  pageUrl: string;
  publicPreviewEligible: boolean;
};

export type RuleEvaluation = {
  code: string;
  category: AuditCategory;
  applicable: boolean;
  availablePoints: number;
  earnedPoints: number;
};

export type AuditEvaluation = {
  findings: AuditFinding[];
  rules: RuleEvaluation[];
  limitations: string[];
};

export type CategoryScore = {
  status: "scored" | "insufficient_evidence";
  score: number | null;
  earnedPoints: number;
  applicablePoints: number;
  evaluatedRuleCount: number;
};

export type AuditScores = {
  scoreVersion: string;
  overallStatus: "scored" | "insufficient_evidence";
  overallScore: number | null;
  categoryScores: Record<AuditCategory, CategoryScore>;
};

export type PublicReportFinding = Pick<
  AuditFinding,
  "code" | "category" | "severity" | "title" | "impact" | "recommendation"
> & {
  evidence?: FindingEvidence;
};

export type PublicAuditReport = AuditScores & {
  reportVersion: string;
  domain: string;
  auditedAt: string;
  status: AuditCompletionStatus;
  findings: PublicReportFinding[];
  lockedFindingCount: number;
  limitations: string[];
};

export type PrivateAuditReport = PublicAuditReport & {
  findings: PublicReportFinding[];
  pages: Array<{
    url: string;
    locale: string | null;
    status: "extracted" | "blocked" | "failed";
  }>;
};

export type SafeAudit = {
  id: string;
  status: "preparing" | "awaiting_confirmation" | "running" | "completed" | "partial" | "failed";
  detectedLocale: string | null;
  alternatives: DiscoveredLocaleAlternative[];
  targetLocale?: string | null;
  targetMarket?: string | null;
  publicSlug?: string;
  summary?: PublicAuditReport;
};

export type LocalisationAuditError =
  | { code: "invalid_audit_url"; message: string }
  | { code: "audit_url_not_public"; message: string }
  | { code: "audit_fetch_failed"; message: string }
  | { code: "audit_response_not_html"; message: string }
  | { code: "audit_response_too_large"; message: string }
  | { code: "audit_rate_limited"; message: string }
  | { code: "audit_not_found"; message: string }
  | { code: "audit_not_awaiting_confirmation"; message: string }
  | { code: "audit_not_complete"; message: string }
  | { code: "report_not_found"; message: string }
  | { code: "audit_access_not_configured"; message: string }
  | { code: "audit_email_delivery_failed"; message: string }
  | { code: "invalid_report_access_token"; message: string };

export type PrepareAuditInput = {
  url: string;
  ipAddress: string;
};

export type ConfirmAuditInput = {
  auditId: string;
  targetLocale: string;
  targetMarket: string;
};

export type UnlockAuditInput = {
  auditId: string;
  email: string;
  name?: string;
  origin: string;
};
