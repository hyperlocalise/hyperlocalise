import { billingBalanceFeatureIds, type AutumnFeatureId } from "@/lib/billing/autumn-ids";

/** Display labels for Autumn feature balances shown on billing settings. */
export const usageFeatureLabels: Partial<Record<AutumnFeatureId, string>> = {
  ai_tokens: "Words",
  translation_jobs: "Translation jobs",
  agent_runs: "Agent runs",
  seats: "Seats",
  projects: "Projects",
  automations: "Automations",
  integrations: "Integrations",
};

export function getUsageFeatureLabel(featureId: string) {
  if (featureId in usageFeatureLabels) {
    return usageFeatureLabels[featureId as AutumnFeatureId];
  }

  return featureId.replaceAll("_", " ");
}

export { billingBalanceFeatureIds };
