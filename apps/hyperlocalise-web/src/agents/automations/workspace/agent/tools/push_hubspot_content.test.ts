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
import { createPushHubspotContentTool } from "./push_hubspot_content";

const mocks = vi.hoisted(() => ({
  runPushHubspotContent: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/hubspot/push-hubspot-content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hubspot/push-hubspot-content")>();
  return {
    ...actual,
    runPushHubspotContent: (...args: unknown[]) => mocks.runPushHubspotContent(...args),
  };
});

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

function hubspotConfig(overrides: { enabled?: boolean; workosUserId?: string } = {}) {
  return {
    enabled: overrides.enabled ?? true,
    workosUserId: overrides.workosUserId ?? "user-1",
    sourceLocale: "en",
    emailIds: ["email-1"],
    formIds: [],
    blogPostIds: [],
    landingPageIds: [],
    websitePageIds: [],
    messageTemplateIds: [],
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
    name: "HubSpot content",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? { hubspot: hubspotConfig() },
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
    plan: { tools: ["push_hubspot_content"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createPushHubspotContentTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when HubSpot is disabled", async () => {
    await expect(
      createPushHubspotContentTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("push_hubspot_content_not_configured");
    await expect(
      createPushHubspotContentTool(
        session({ toolConfig: { hubspot: hubspotConfig({ enabled: false }) } }),
      ).execute!({}, toolOptions),
    ).rejects.toThrow("push_hubspot_content_not_configured");
    expect(mocks.runPushHubspotContent).not.toHaveBeenCalled();
  });

  it("returns a persisted push result without calling HubSpot again", async () => {
    const current = session({
      outputSummary: { pushHubspotContent: { pushedLocales: 2, failedLocales: 0 } },
    });

    await expect(createPushHubspotContentTool(current).execute!({}, toolOptions)).resolves.toEqual({
      pushedLocales: 2,
      failedLocales: 0,
    });
    expect(mocks.runPushHubspotContent).not.toHaveBeenCalled();
  });

  it("forwards selected source paths and fails the run when nothing pushes", async () => {
    mocks.runPushHubspotContent.mockResolvedValue({
      pushedLocales: 0,
      skippedLocales: 1,
      failedLocales: 2,
      itemsProcessed: 2,
    });
    const current = session({
      inputSnapshot: {
        operation: "push_approved",
        sourcePaths: [" hubspot/emails/email-1/welcome.html ", ""],
      },
    });

    await expect(createPushHubspotContentTool(current).execute!({}, toolOptions)).resolves.toEqual({
      pushedLocales: 0,
      skippedLocales: 1,
      failedLocales: 2,
      itemsProcessed: 2,
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("hubspot_push_failed");
    expect(mocks.runPushHubspotContent).toHaveBeenCalledWith({
      organizationId: "org-1",
      automation: current.automation,
      sourcePaths: [" hubspot/emails/email-1/welcome.html "],
    });
  });
});
