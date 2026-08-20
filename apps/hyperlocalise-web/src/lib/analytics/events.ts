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

/** Low-cardinality, non-PII event property bags (max 2 keys for Vercel Analytics). */
export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export const LOCALISATION_AUDIT_ANALYTICS_EVENTS = {
  start: "localisation_audit_start",
  reuse: "localisation_audit_reuse",
  retry: "localisation_audit_retry",
  completed: "localisation_audit_completed",
  failed: "localisation_audit_failed",
  blocked: "localisation_audit_blocked",
  teaserView: "localisation_audit_teaser_view",
  reportEmailRequest: "localisation_audit_report_email_request",
  reportEmailSent: "localisation_audit_report_email_sent",
  emailVerified: "localisation_audit_email_verified",
  ctaClick: "localisation_audit_cta_click",
} as const;

export type LocalisationAuditAnalyticsEvent =
  (typeof LOCALISATION_AUDIT_ANALYTICS_EVENTS)[keyof typeof LOCALISATION_AUDIT_ANALYTICS_EVENTS];

export const PRODUCT_USAGE_ANALYTICS_EVENTS = {
  translationJobCompleted: "translation_job_completed",
  translationJobFailed: "translation_job_failed",
  translationJobCreated: "translation_job_created",
  agentRunCompleted: "agent_run_completed",
  agentRunFailed: "agent_run_failed",
  aiTokensConsumed: "ai_tokens_consumed",
  projectCreated: "project_created",
  automationCreated: "automation_created",
  automationRunStarted: "automation_run_started",
  integrationConnected: "integration_connected",
  seatAdded: "seat_added",
  catSegmentApproved: "cat_segment_approved",
  catSegmentDraftSaved: "cat_segment_draft_saved",
  catCommentCreated: "cat_comment_created",
  catAiRecommendationRequested: "cat_ai_recommendation_requested",
  issueCreated: "issue_created",
  glossaryCreated: "glossary_created",
  glossaryTermCreated: "glossary_term_created",
  memoryCreated: "memory_created",
} as const;

export type ProductUsageAnalyticsEvent =
  (typeof PRODUCT_USAGE_ANALYTICS_EVENTS)[keyof typeof PRODUCT_USAGE_ANALYTICS_EVENTS];

const AUTUMN_EVENT_TO_PRODUCT_USAGE: Record<string, ProductUsageAnalyticsEvent> = {
  "translation_job.completed": PRODUCT_USAGE_ANALYTICS_EVENTS.translationJobCompleted,
  "agent_run.completed": PRODUCT_USAGE_ANALYTICS_EVENTS.agentRunCompleted,
  "ai_tokens.consumed": PRODUCT_USAGE_ANALYTICS_EVENTS.aiTokensConsumed,
};

const AUTUMN_EVENT_TO_SOURCE: Record<string, string> = {
  "translation_job.completed": "translation_job",
  "agent_run.completed": "agent_run",
  "ai_tokens.consumed": "ai_tokens",
};

const ALLOWED_PROPERTY_KEYS = new Set([
  "outcome",
  "status",
  "stage",
  "score_band",
  "cta",
  "source",
  "retryable",
  "delivery",
  "token_band",
  "feature",
]);

/** Drop PII / high-cardinality values and keep at most two allowed keys. */
export function sanitizeAnalyticsProperties(
  properties?: AnalyticsProperties,
): Record<string, string | number | boolean> {
  if (!properties) return {};

  const sanitized: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED_PROPERTY_KEYS.has(key)) continue;
    if (value == null) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = value;
    }
    if (Object.keys(sanitized).length >= 2) break;
  }
  return sanitized;
}

export function scoreBand(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "unknown";
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "needs_improvement";
  if (score >= 25) return "poor";
  return "critical";
}

export function tokenBand(totalTokens: number | null | undefined): string {
  if (totalTokens == null || Number.isNaN(totalTokens) || totalTokens <= 0) return "none";
  if (totalTokens < 1000) return "low";
  if (totalTokens < 10_000) return "mid";
  return "high";
}

export function productUsageEventForAutumnEventName(
  autumnEventName: string,
): ProductUsageAnalyticsEvent | null {
  return AUTUMN_EVENT_TO_PRODUCT_USAGE[autumnEventName] ?? null;
}

export function productUsageSourceForAutumnEventName(autumnEventName: string): string {
  return AUTUMN_EVENT_TO_SOURCE[autumnEventName] ?? "other";
}

export function productUsageSourceForMeterSource(source: string): string {
  if (source.includes("translation")) return "translation_job";
  if (source.includes("agent")) return "agent_run";
  return "other";
}
