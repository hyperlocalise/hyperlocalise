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
import { createPushMailchimpContentTool } from "./push_mailchimp_content";

const mocks = vi.hoisted(() => ({
  runPushMailchimpContent: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/mailchimp/push-mailchimp-content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mailchimp/push-mailchimp-content")>();
  return {
    ...actual,
    runPushMailchimpContent: (...args: unknown[]) => mocks.runPushMailchimpContent(...args),
  };
});

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

function mailchimpConfig(overrides: { enabled?: boolean; workosUserId?: string } = {}) {
  return {
    enabled: overrides.enabled ?? true,
    workosUserId: overrides.workosUserId ?? "user-1",
    sourceLocale: "en",
    campaignIds: ["campaign-1"],
    templateIds: [],
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
    name: "Mailchimp content",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? { mailchimp: mailchimpConfig() },
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
    plan: { tools: ["push_mailchimp_content"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createPushMailchimpContentTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when Mailchimp is disabled", async () => {
    await expect(
      createPushMailchimpContentTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("push_mailchimp_content_not_configured");
    await expect(
      createPushMailchimpContentTool(
        session({ toolConfig: { mailchimp: mailchimpConfig({ enabled: false }) } }),
      ).execute!({}, toolOptions),
    ).rejects.toThrow("push_mailchimp_content_not_configured");
    expect(mocks.runPushMailchimpContent).not.toHaveBeenCalled();
  });

  it("returns a persisted push result without calling Mailchimp again", async () => {
    const current = session({
      outputSummary: { pushMailchimpContent: { pushedLocales: 2, failedLocales: 0 } },
    });

    await expect(
      createPushMailchimpContentTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      pushedLocales: 2,
      failedLocales: 0,
    });
    expect(mocks.runPushMailchimpContent).not.toHaveBeenCalled();
  });

  it("treats pushedLocales 0 as a completed replay result", async () => {
    const current = session({
      outputSummary: { pushMailchimpContent: { pushedLocales: 0, failedLocales: 0 } },
    });

    await expect(
      createPushMailchimpContentTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      pushedLocales: 0,
      failedLocales: 0,
    });
    expect(mocks.runPushMailchimpContent).not.toHaveBeenCalled();
  });

  it("forwards selected source paths and fails the run when nothing pushes", async () => {
    mocks.runPushMailchimpContent.mockResolvedValue({
      pushedLocales: 0,
      skippedLocales: 1,
      failedLocales: 2,
      itemsProcessed: 2,
      warnings: ["Mailchimp rejected the copy"],
    });
    const current = session({
      inputSnapshot: {
        operation: "push_approved",
        sourcePaths: [" mailchimp/campaigns/1/welcome.html ", ""],
      },
    });

    await expect(
      createPushMailchimpContentTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      pushedLocales: 0,
      skippedLocales: 1,
      failedLocales: 2,
      itemsProcessed: 2,
      warnings: ["Mailchimp rejected the copy"],
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("Mailchimp rejected the copy");
    expect(mocks.runPushMailchimpContent).toHaveBeenCalledWith({
      organizationId: "org-1",
      automation: current.automation,
      sourcePaths: [" mailchimp/campaigns/1/welcome.html "],
    });
  });

  it("uses mailchimp_push_failed when no warning is present", async () => {
    mocks.runPushMailchimpContent.mockResolvedValue({
      pushedLocales: 0,
      skippedLocales: 0,
      failedLocales: 1,
      itemsProcessed: 1,
      warnings: [],
    });
    const current = session();

    await expect(
      createPushMailchimpContentTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      pushedLocales: 0,
      skippedLocales: 0,
      failedLocales: 1,
      itemsProcessed: 1,
      warnings: [],
    });
    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("mailchimp_push_failed");
  });
});
