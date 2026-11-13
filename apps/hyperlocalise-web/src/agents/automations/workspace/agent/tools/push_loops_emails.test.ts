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
import { createPushLoopsEmailsTool } from "./push_loops_emails";

const mocks = vi.hoisted(() => ({
  runPushLoopsEmails: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/loops/push-loops-emails", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/loops/push-loops-emails")>();
  return {
    ...actual,
    runPushLoopsEmails: (...args: unknown[]) => mocks.runPushLoopsEmails(...args),
  };
});

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
    name: "Loops emails",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? {
      loops: {
        enabled: true,
        sourceLocale: "en",
        transactionalIds: ["txn-1"],
        campaignIds: [],
        workflowIds: [],
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
    plan: { tools: ["push_loops_emails"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createPushLoopsEmailsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when Loops push is not configured", async () => {
    await expect(
      createPushLoopsEmailsTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("push_loops_emails_not_configured");
    expect(mocks.runPushLoopsEmails).not.toHaveBeenCalled();
  });

  it("returns a persisted push result without calling Loops again", async () => {
    const current = session({
      outputSummary: { pushLoopsEmails: { pushedLocales: 2, failedLocales: 0 } },
    });

    await expect(createPushLoopsEmailsTool(current).execute!({}, toolOptions)).resolves.toEqual({
      pushedLocales: 2,
      failedLocales: 0,
    });
    expect(mocks.runPushLoopsEmails).not.toHaveBeenCalled();
  });

  it("forwards selected source paths and fails the run when nothing pushes", async () => {
    mocks.runPushLoopsEmails.mockResolvedValue({
      pushedLocales: 0,
      skippedLocales: 1,
      failedLocales: 2,
      itemsProcessed: 2,
      warnings: ["copy missing"],
    });
    const current = session({
      inputSnapshot: {
        operation: "push_approved",
        sourcePaths: [" loops/welcome.html ", ""],
      },
    });

    await expect(createPushLoopsEmailsTool(current).execute!({}, toolOptions)).resolves.toEqual({
      pushedLocales: 0,
      skippedLocales: 1,
      failedLocales: 2,
      itemsProcessed: 2,
      warnings: ["copy missing"],
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("loops_push_failed");
    expect(mocks.runPushLoopsEmails).toHaveBeenCalledWith({
      organizationId: "org-1",
      automation: current.automation,
      sourcePaths: [" loops/welcome.html "],
      workflowRunId: "run-1",
    });
  });
});
