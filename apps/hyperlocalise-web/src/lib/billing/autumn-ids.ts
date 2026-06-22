/**
 * Autumn product and feature identifiers configured in the Autumn dashboard.
 * Plan IDs can change pricing in Autumn without local schema migrations.
 */

/** Subscription plan IDs (configure matching products in Autumn). */
export const autumnPlanIds = {
  /** Free / dev sandbox plan for onboarding and local testing. */
  free: "free",
  /** Paid workspace subscription plan. */
  growth: "growth",
  /** Custom enterprise subscription plan. */
  enterprise: "enterprise",
} as const;

export type AutumnPlanId = (typeof autumnPlanIds)[keyof typeof autumnPlanIds];

/**
 * Autumn feature IDs configured in the Autumn dashboard.
 * These include credit-system balances, non-consumable limits, and boolean gates.
 */
export const autumnFeatureIds = {
  aiTokens: "ai_tokens",
  translationJobs: "translation_jobs",
  agentRuns: "agent_runs",
  seats: "seats",
  projects: "projects",
  automations: "automations",
  integrations: "integrations",
  aiFeatures: "ai_features",
} as const;

export type AutumnFeatureId = (typeof autumnFeatureIds)[keyof typeof autumnFeatureIds];

/**
 * Locally tracked usage event feature IDs.
 * These must match `usage_events.feature_id` until the enum is migrated.
 */
export const usageFeatureIds = {
  translationJobs: autumnFeatureIds.translationJobs,
  agentRuns: autumnFeatureIds.agentRuns,
} as const;

export type UsageFeatureId = (typeof usageFeatureIds)[keyof typeof usageFeatureIds];

/** Customer-facing balances shown on the billing settings usage panel. */
export const billingBalanceFeatureIds = [
  autumnFeatureIds.aiTokens,
  usageFeatureIds.translationJobs,
  usageFeatureIds.agentRuns,
  autumnFeatureIds.seats,
  autumnFeatureIds.projects,
  autumnFeatureIds.automations,
  autumnFeatureIds.integrations,
] as const satisfies readonly AutumnFeatureId[];
