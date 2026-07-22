/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
      aiTokens: "ai_tokens",
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
