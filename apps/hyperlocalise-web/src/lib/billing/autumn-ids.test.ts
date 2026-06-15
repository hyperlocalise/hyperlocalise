import { describe, expect, it } from "vite-plus/test";

import {
  autumnFeatureIds,
  autumnPlanIds,
  billingBalanceFeatureIds,
  usageFeatureIds,
} from "@/lib/billing/autumn-ids";

describe("autumn identifiers", () => {
  it("exposes stable plan and usage feature IDs", () => {
    expect(autumnPlanIds).toEqual({
      free: "free",
      growth: "growth",
      enterprise: "enterprise",
    });

    expect(autumnFeatureIds).toEqual({
      aiTokens: "ai_tokens",
      translationJobs: "translation_jobs",
      agentRuns: "agent_runs",
      seats: "seats",
      projects: "projects",
      automations: "automations",
      integrations: "integrations",
      aiFeatures: "ai_features",
    });

    expect(usageFeatureIds).toEqual({
      translationJobs: "translation_jobs",
      agentRuns: "agent_runs",
    });

    expect(billingBalanceFeatureIds).toEqual([
      autumnFeatureIds.aiTokens,
      usageFeatureIds.translationJobs,
      usageFeatureIds.agentRuns,
      autumnFeatureIds.seats,
      autumnFeatureIds.projects,
      autumnFeatureIds.automations,
      autumnFeatureIds.integrations,
    ]);
  });
});
