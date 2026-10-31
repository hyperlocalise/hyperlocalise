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
import { createImportCustomerIoCampaignsTool } from "./import_customer_io_campaigns";

const mocks = vi.hoisted(() => ({
  runImportCustomerIoCampaigns: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/customer-io/import-customer-io-campaigns", () => ({
  runImportCustomerIoCampaigns: (...args: unknown[]) => mocks.runImportCustomerIoCampaigns(...args),
}));

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

function customerIoConfig(enabled = true) {
  return {
    enabled,
    workosUserId: "user-1",
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
    triggerSource: "scheduled",
    status: "running",
    inputSnapshot: {},
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
    plan: { tools: ["import_customer_io_campaigns"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createImportCustomerIoCampaignsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when Customer.io import is not configured", async () => {
    await expect(
      createImportCustomerIoCampaignsTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("import_customer_io_campaigns_not_configured");
    await expect(
      createImportCustomerIoCampaignsTool(
        session({ toolConfig: { customerIo: customerIoConfig(false) } }),
      ).execute!({}, toolOptions),
    ).rejects.toThrow("import_customer_io_campaigns_not_configured");
    expect(mocks.runImportCustomerIoCampaigns).not.toHaveBeenCalled();
  });

  it("returns a persisted import result without calling Customer.io again", async () => {
    const current = session({
      outputSummary: { importCustomerIoCampaigns: { imported: 2, skipped: 1, failed: 0 } },
    });

    await expect(
      createImportCustomerIoCampaignsTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({ imported: 2, skipped: 1, failed: 0 });
    expect(mocks.runImportCustomerIoCampaigns).not.toHaveBeenCalled();
  });

  it("marks the run failed when every campaign import fails", async () => {
    mocks.runImportCustomerIoCampaigns.mockResolvedValue({
      imported: 0,
      skipped: 0,
      failed: 3,
      jobsCreated: 0,
    });
    const current = session();

    await expect(
      createImportCustomerIoCampaignsTool(current).execute!({ summary: "  weekly  " }, toolOptions),
    ).resolves.toEqual({
      imported: 0,
      skipped: 0,
      failed: 3,
      jobsCreated: 0,
      summary: "weekly",
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("customer_io_import_failed");
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledWith({
      runId: "run-1",
      organizationId: "org-1",
      outputSummary: {
        importCustomerIoCampaigns: {
          imported: 0,
          skipped: 0,
          failed: 3,
          jobsCreated: 0,
          summary: "weekly",
        },
      },
    });
  });
});
