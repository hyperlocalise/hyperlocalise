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
  teaserView: "localisation_audit_teaser_view",
  reportEmailRequest: "localisation_audit_report_email_request",
  reportEmailSent: "localisation_audit_report_email_sent",
  emailVerified: "localisation_audit_email_verified",
  ctaClick: "localisation_audit_cta_click",
} as const;

export type LocalisationAuditAnalyticsEvent =
  (typeof LOCALISATION_AUDIT_ANALYTICS_EVENTS)[keyof typeof LOCALISATION_AUDIT_ANALYTICS_EVENTS];

const ALLOWED_PROPERTY_KEYS = new Set([
  "outcome",
  "status",
  "stage",
  "score_band",
  "cta",
  "source",
  "retryable",
  "delivery",
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
  if (score >= 80) return "high";
  if (score >= 50) return "mid";
  return "low";
}
