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
import { createPushCustomerIoCampaignsTool } from "./push_customer_io_campaigns";

const mocks = vi.hoisted(() => ({
  runPushCustomerIoCampaigns: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/customer-io/push-customer-io-campaigns", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/customer-io/push-customer-io-campaigns")>();
  return {
    ...actual,
    runPushCustomerIoCampaigns: (...args: unknown[]) => mocks.runPushCustomerIoCampaigns(...args),
  };
});

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

function customerIoConfig(overrides: { enabled?: boolean; workosUserId?: string } = {}) {
  return {
    enabled: overrides.enabled ?? true,
    workosUserId: overrides.workosUserId ?? "user-1",
    broadcastIds: [],
    campaignIds: ["camp-1"],
    newsletterIds: [],
    transactionalMessageIds: [],
    broadcastActions: {},
    campaignActions: {},
    newsletterActions: {},
    transactionalMessageActions: {},
    existingTranslationPolicy: "seed_empty" as const,
    overwriteWhenRemoteNewer: true,
  };
}

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
    name: "Customer.io campaigns",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? { customerIo: customerIoConfig() },
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
    plan: { tools: ["push_customer_io_campaigns"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createPushCustomerIoCampaignsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when Customer.io is disabled or missing a Pipes user", async () => {
    await expect(
      createPushCustomerIoCampaignsTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("push_customer_io_campaigns_not_configured");
    await expect(
      createPushCustomerIoCampaignsTool(
        session({ toolConfig: { customerIo: customerIoConfig({ workosUserId: "" }) } }),
      ).execute!({}, toolOptions),
    ).rejects.toThrow("push_customer_io_campaigns_not_configured");
    expect(mocks.runPushCustomerIoCampaigns).not.toHaveBeenCalled();
  });

  it("returns a persisted push result without calling Customer.io again", async () => {
    const current = session({
      outputSummary: { pushCustomerIoCampaigns: { pushedLocales: 2, failedLocales: 0 } },
    });

    await expect(
      createPushCustomerIoCampaignsTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      pushedLocales: 2,
      failedLocales: 0,
    });
    expect(mocks.runPushCustomerIoCampaigns).not.toHaveBeenCalled();
  });

  it("forwards selected source paths and fails the run when nothing pushes", async () => {
    mocks.runPushCustomerIoCampaigns.mockResolvedValue({
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

    await expect(
      createPushCustomerIoCampaignsTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      pushedLocales: 0,
      skippedLocales: 1,
      failedLocales: 2,
      itemsProcessed: 2,
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("customer_io_push_failed");
    expect(mocks.runPushCustomerIoCampaigns).toHaveBeenCalledWith({
      organizationId: "org-1",
      automation: current.automation,
      sourcePaths: [" campaigns/promo.json "],
    });
  });
});
