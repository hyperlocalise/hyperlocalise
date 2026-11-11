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
import { createPushWebflowTranslationsTool } from "./push_webflow_translations";

const mocks = vi.hoisted(() => ({
  runPushWebflowTranslations: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/webflow/push-webflow-translations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/webflow/push-webflow-translations")>();
  return {
    ...actual,
    runPushWebflowTranslations: (...args: unknown[]) => mocks.runPushWebflowTranslations(...args),
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
    name: "Webflow items",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? {
      webflow: {
        enabled: true,
        connectionId: "11111111-1111-1111-1111-111111111111",
        siteId: "site-1",
        collectionIds: ["col-1"],
        sourceLocale: "en",
        targetLocales: ["fr"],
        existingTranslationPolicy: "seed_empty",
        runQa: true,
        publishOnPush: false,
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
    plan: { tools: ["push_webflow_translations"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createPushWebflowTranslationsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when Webflow push is not configured", async () => {
    await expect(
      createPushWebflowTranslationsTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("push_webflow_translations_not_configured");
    expect(mocks.runPushWebflowTranslations).not.toHaveBeenCalled();
  });

  it("returns a persisted push result without calling Webflow again", async () => {
    const current = session({
      outputSummary: { pushWebflowTranslations: { pushedLocales: 2, failedLocales: 0 } },
    });

    await expect(
      createPushWebflowTranslationsTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      pushedLocales: 2,
      failedLocales: 0,
    });
    expect(mocks.runPushWebflowTranslations).not.toHaveBeenCalled();
  });

  it("forwards selected source paths and fails the run when nothing pushes", async () => {
    mocks.runPushWebflowTranslations.mockResolvedValue({
      pushedLocales: 0,
      skippedLocales: 1,
      failedLocales: 2,
      itemsProcessed: 2,
    });
    const current = session({
      inputSnapshot: {
        operation: "push_approved",
        sourcePaths: [" webflow/site-1/col-1/item.json ", ""],
      },
    });

    await expect(
      createPushWebflowTranslationsTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      pushedLocales: 0,
      skippedLocales: 1,
      failedLocales: 2,
      itemsProcessed: 2,
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("webflow_push_failed");
    expect(mocks.runPushWebflowTranslations).toHaveBeenCalledWith({
      organizationId: "org-1",
      automation: current.automation,
      sourcePaths: [" webflow/site-1/col-1/item.json "],
    });
  });
});
