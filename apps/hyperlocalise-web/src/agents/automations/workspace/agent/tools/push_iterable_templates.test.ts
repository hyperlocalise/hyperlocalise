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
import { createPushIterableTemplatesTool } from "./push_iterable_templates";

const mocks = vi.hoisted(() => ({
  runPushIterableTemplates: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/iterable/push-iterable-templates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/iterable/push-iterable-templates")>();
  return {
    ...actual,
    runPushIterableTemplates: (...args: unknown[]) => mocks.runPushIterableTemplates(...args),
  };
});

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

function iterableConfig(
  overrides: Partial<NonNullable<WorkspaceAutomationRecord["toolConfig"]["iterable"]>> = {},
) {
  return {
    enabled: true,
    sourceLocale: "en",
    templateIds: ["tmpl-1"],
    snippetIds: [],
    existingTranslationPolicy: "seed_empty" as const,
    ...overrides,
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
    name: "Iterable templates",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? { iterable: iterableConfig() },
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
    plan: { tools: ["push_iterable_templates"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createPushIterableTemplatesTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when Iterable push is not configured", async () => {
    await expect(
      createPushIterableTemplatesTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("push_iterable_templates_not_configured");
    expect(mocks.runPushIterableTemplates).not.toHaveBeenCalled();
  });

  it("returns a persisted push result without calling Iterable again", async () => {
    const current = session({
      outputSummary: { pushIterableTemplates: { pushedLocales: 2, failedLocales: 0 } },
    });

    await expect(
      createPushIterableTemplatesTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      pushedLocales: 2,
      failedLocales: 0,
    });
    expect(mocks.runPushIterableTemplates).not.toHaveBeenCalled();
  });

  it("forwards selected source paths and fails the run when nothing pushes", async () => {
    mocks.runPushIterableTemplates.mockResolvedValue({
      pushedLocales: 0,
      skippedLocales: 1,
      failedLocales: 2,
      itemsProcessed: 2,
    });
    const current = session({
      inputSnapshot: {
        operation: "push_approved",
        sourcePaths: [" iterable/templates/email/welcome.html ", ""],
      },
    });

    await expect(
      createPushIterableTemplatesTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      pushedLocales: 0,
      skippedLocales: 1,
      failedLocales: 2,
      itemsProcessed: 2,
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("iterable_push_failed");
    expect(mocks.runPushIterableTemplates).toHaveBeenCalledWith({
      organizationId: "org-1",
      automation: current.automation,
      sourcePaths: [" iterable/templates/email/welcome.html "],
    });
  });
});
