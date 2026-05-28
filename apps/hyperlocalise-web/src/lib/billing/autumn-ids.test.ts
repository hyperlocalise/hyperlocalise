import { describe, expect, it } from "vite-plus/test";

import { autumnPlanIds, meteredUsageFeatureIds, usageFeatureIds } from "@/lib/billing/autumn-ids";

describe("autumn identifiers", () => {
  it("exposes stable plan and usage feature IDs", () => {
    expect(autumnPlanIds).toEqual({
      free: "free",
      team: "team",
    });

    expect(usageFeatureIds).toEqual({
      translationJobs: "translation_jobs",
      translationUnits: "translation_units",
      sourceCharacters: "source_characters",
      aiTokens: "ai_tokens",
      apiRequests: "api_requests",
      agentRuns: "agent_runs",
    });

    expect(meteredUsageFeatureIds).toEqual([
      usageFeatureIds.translationJobs,
      usageFeatureIds.translationUnits,
      usageFeatureIds.sourceCharacters,
      usageFeatureIds.aiTokens,
      usageFeatureIds.apiRequests,
      usageFeatureIds.agentRuns,
    ]);
  });
});
