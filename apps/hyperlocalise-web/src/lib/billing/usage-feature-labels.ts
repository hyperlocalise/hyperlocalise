import { meteredUsageFeatureIds, type UsageFeatureId } from "@/lib/billing/autumn-ids";

/** Display labels for metered usage features shown on billing settings. */
export const usageFeatureLabels: Record<UsageFeatureId, string> = {
  translation_jobs: "Translation jobs",
  translation_units: "Translation units",
  source_characters: "Source characters",
  ai_tokens: "AI tokens",
  api_requests: "API requests",
  agent_runs: "Agent runs",
};

export function getUsageFeatureLabel(featureId: string) {
  if (featureId in usageFeatureLabels) {
    return usageFeatureLabels[featureId as UsageFeatureId];
  }

  return featureId.replaceAll("_", " ");
}

export { meteredUsageFeatureIds };
