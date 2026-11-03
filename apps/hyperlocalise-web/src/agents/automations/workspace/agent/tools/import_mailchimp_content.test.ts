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
import { createImportMailchimpContentTool } from "./import_mailchimp_content";

const mocks = vi.hoisted(() => ({
  runImportMailchimpContent: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/mailchimp/import-mailchimp-content", () => ({
  runImportMailchimpContent: (...args: unknown[]) => mocks.runImportMailchimpContent(...args),
}));

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

function mailchimpConfig(enabled = true) {
  return {
    enabled,
    workosUserId: "user-1",
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
    plan: { tools: ["import_mailchimp_content"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createImportMailchimpContentTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when Mailchimp import is not configured", async () => {
    await expect(
      createImportMailchimpContentTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("import_mailchimp_content_not_configured");
    await expect(
      createImportMailchimpContentTool(
        session({ toolConfig: { mailchimp: mailchimpConfig(false) } }),
      ).execute!({}, toolOptions),
    ).rejects.toThrow("import_mailchimp_content_not_configured");
    expect(mocks.runImportMailchimpContent).not.toHaveBeenCalled();
  });

  it("returns a persisted import result without calling Mailchimp again", async () => {
    const current = session({
      outputSummary: { importMailchimpContent: { imported: 2, skipped: 1, failed: 0 } },
    });

    await expect(
      createImportMailchimpContentTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({ imported: 2, skipped: 1, failed: 0 });
    expect(mocks.runImportMailchimpContent).not.toHaveBeenCalled();
  });

  it("does not replay a persisted object missing imported", async () => {
    mocks.runImportMailchimpContent.mockResolvedValue({
      imported: 1,
      skipped: 0,
      failed: 0,
      jobsCreated: 1,
    });
    const current = session({
      outputSummary: { importMailchimpContent: { status: "succeeded" } },
    });

    await expect(
      createImportMailchimpContentTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      imported: 1,
      skipped: 0,
      failed: 0,
      jobsCreated: 1,
    });
    expect(mocks.runImportMailchimpContent).toHaveBeenCalledWith({
      organizationId: "org-1",
      automation: current.automation,
      workflowRunId: "run-1",
    });
    expect(current.terminalStatus).toBeNull();
  });

  it("marks the run failed when every Mailchimp import fails", async () => {
    mocks.runImportMailchimpContent.mockResolvedValue({
      imported: 0,
      skipped: 0,
      failed: 3,
      jobsCreated: 0,
    });
    const current = session();

    await expect(
      createImportMailchimpContentTool(current).execute!({ summary: "  weekly  " }, toolOptions),
    ).resolves.toEqual({
      imported: 0,
      skipped: 0,
      failed: 3,
      jobsCreated: 0,
      summary: "weekly",
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("mailchimp_import_failed");
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledWith({
      runId: "run-1",
      organizationId: "org-1",
      outputSummary: {
        importMailchimpContent: {
          imported: 0,
          skipped: 0,
          failed: 3,
          jobsCreated: 0,
          summary: "weekly",
        },
      },
    });
  });

  it("keeps the run open when at least one campaign or template imported", async () => {
    mocks.runImportMailchimpContent.mockResolvedValue({
      imported: 1,
      skipped: 0,
      failed: 2,
      jobsCreated: 1,
    });
    const current = session();

    await expect(
      createImportMailchimpContentTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      imported: 1,
      skipped: 0,
      failed: 2,
      jobsCreated: 1,
    });
    expect(current.terminalStatus).toBeNull();
    expect(current.terminalError).toBeNull();
  });
});
