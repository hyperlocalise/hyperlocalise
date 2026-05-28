/**
 * Autumn product and feature identifiers configured in the Autumn dashboard.
 * Plan IDs can change pricing in Autumn without local schema migrations.
 */

/** Subscription plan IDs (configure matching products in Autumn). */
export const autumnPlanIds = {
  /** Free / dev sandbox plan for onboarding and local testing. */
  free: "free",
  /** Paid workspace subscription plan. */
  team: "team",
} as const;

export type AutumnPlanId = (typeof autumnPlanIds)[keyof typeof autumnPlanIds];

/**
 * Metered usage feature IDs aligned with HL-418 usage control.
 * These must match Autumn feature definitions and `usage_events.feature_id`.
 */
export const usageFeatureIds = {
  translationJobs: "translation_jobs",
  translationUnits: "translation_units",
  sourceCharacters: "source_characters",
  aiTokens: "ai_tokens",
  apiRequests: "api_requests",
  agentRuns: "agent_runs",
} as const;

export type UsageFeatureId = (typeof usageFeatureIds)[keyof typeof usageFeatureIds];

/** Metered features shown on the billing settings usage panel. */
export const meteredUsageFeatureIds = [
  usageFeatureIds.translationJobs,
  usageFeatureIds.translationUnits,
  usageFeatureIds.sourceCharacters,
  usageFeatureIds.aiTokens,
  usageFeatureIds.apiRequests,
  usageFeatureIds.agentRuns,
] as const satisfies readonly UsageFeatureId[];
