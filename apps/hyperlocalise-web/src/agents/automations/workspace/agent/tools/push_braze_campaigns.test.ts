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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automation-types";

import type { WorkspaceOrchestratorSession } from "../context";
import { createPushBrazeCampaignsTool } from "./push_braze_campaigns";

const mocks = vi.hoisted(() => ({
  runPushBrazeCampaigns: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/braze/push-braze-campaigns", () => ({
  runPushBrazeCampaigns: (...args: unknown[]) => mocks.runPushBrazeCampaigns(...args),
  readBrazePushSourcePaths: (inputSnapshot: Record<string, unknown> | null | undefined) => {
    const raw = inputSnapshot?.sourcePaths;
    if (!Array.isArray(raw)) {
      return undefined;
    }
    return raw.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
  },
}));

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

function session(
  overrides: {
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
    outputSummary?: Record<string, unknown>;
    inputSnapshot?: Record<string, unknown>;
  } = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "Braze campaigns",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? {
      brazeCampaigns: {
        enabled: true,
        sourceLocale: "en",
        campaignIds: ["camp-1"],
        canvasIds: [],
        existingTranslationPolicy: "seed_empty",
        overwriteWhenRemoteNewer: true,
      },
    },
    model: "openai/gpt-6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies WorkspaceAutomationRecord;

  const run = {
    id: "run-1",
    automationId: automation.id,
    organizationId: automation.organizationId,
    triggerSource: "manual",
    status: "running",
    inputSnapshot: overrides.inputSnapshot ?? { operation: "push_approved" },
    outputSummary: overrides.outputSummary ?? {},
    error: null,
    githubRepositoryAutomationJobId: null,
    idempotencyKey: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies WorkspaceAutomationRunRecord;

  return {
    organizationId: automation.organizationId,
    automation,
    run,
    plan: { tools: ["push_braze_campaigns"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createPushBrazeCampaignsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when campaign push is not configured", async () => {
    await expect(
      createPushBrazeCampaignsTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("push_braze_campaigns_not_configured");
    expect(mocks.runPushBrazeCampaigns).not.toHaveBeenCalled();
  });

  it("returns a persisted push result without calling Braze again", async () => {
    const current = session({
      outputSummary: { pushBrazeCampaigns: { pushedLocales: 2, failedLocales: 0 } },
    });

    await expect(createPushBrazeCampaignsTool(current).execute!({}, toolOptions)).resolves.toEqual({
      pushedLocales: 2,
      failedLocales: 0,
    });
    expect(mocks.runPushBrazeCampaigns).not.toHaveBeenCalled();
  });

  it("forwards selected source paths and fails the run when nothing pushes", async () => {
    mocks.runPushBrazeCampaigns.mockResolvedValue({
      pushedLocales: 0,
      skippedLocales: 1,
      failedLocales: 2,
      itemsProcessed: 2,
    });
    const current = session({
      inputSnapshot: {
        operation: "push_approved",
        sourcePaths: [" campaigns/promo.json ", ""],
      },
    });

    await expect(createPushBrazeCampaignsTool(current).execute!({}, toolOptions)).resolves.toEqual({
      pushedLocales: 0,
      skippedLocales: 1,
      failedLocales: 2,
      itemsProcessed: 2,
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("braze_push_failed");
    expect(mocks.runPushBrazeCampaigns).toHaveBeenCalledWith({
      organizationId: "org-1",
      automation: current.automation,
      sourcePaths: [" campaigns/promo.json "],
    });
  });
});
