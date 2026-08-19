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
} from "@/lib/agents/workspace-automations";

import type { WorkspaceOrchestratorSession } from "../context";
import { createUseCrowdinTool } from "./use_crowdin";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  createCrowdinReviewTools: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    isStepCount: vi.fn(),
    ToolLoopAgent: class {
      generate = mocks.generate;
    },
  };
});

vi.mock("@/lib/agent-runtime/loops/model", () => ({
  getHyperlocaliseAgentModel: vi.fn(),
}));

vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  extractGenerateResultTokenUsage: vi.fn(),
  withAgentRuntimeUsageMetering: vi.fn(async ({ run }: { run: () => Promise<unknown> }) => run()),
}));

vi.mock("./crowdin-review-tools", () => ({
  createCrowdinReviewTools: (...args: unknown[]) => mocks.createCrowdinReviewTools(...args),
}));

function session(
  toolConfig: WorkspaceAutomationRecord["toolConfig"] = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "Crowdin review",
    instructions: "",
    projectId: null,
    triggerConfig: { mode: "manual" },
    repositoryTarget: { kind: "none" },
    toolConfig,
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
    inputSnapshot: {},
    outputSummary: {},
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
    plan: { tools: ["use_crowdin"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

describe("createUseCrowdinTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createCrowdinReviewTools.mockReturnValue({});
    mocks.generate.mockResolvedValue({ text: "Glossary prefers Speichern." });
  });

  it("rejects when Crowdin is not configured on the automation", async () => {
    await expect(
      createUseCrowdinTool(session()).execute!(
        { objective: "Review Save in German" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("crowdin_not_configured");

    await expect(
      createUseCrowdinTool(
        session({
          crowdin: { enabled: true },
        }),
      ).execute!(
        { objective: "Review Save in German" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("crowdin_not_configured");

    expect(mocks.createCrowdinReviewTools).not.toHaveBeenCalled();
  });

  it("runs a nested review agent with the selected project and author", async () => {
    const current = session({
      crowdin: {
        enabled: true,
        projectId: "ext:crowdin:42",
      },
    });

    const abortSignal = new AbortController().signal;
    const payload = await createUseCrowdinTool(current).execute!(
      { objective: "Review Save in German" },
      { toolCallId: "call-1", messages: [], context: {}, abortSignal },
    );

    expect(mocks.createCrowdinReviewTools).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "ext:crowdin:42",
      actorUserId: "user-1",
    });
    expect(payload).toEqual({
      summary: "Glossary prefers Speichern.",
      projectId: "ext:crowdin:42",
    });
    expect(current.stepResults.use_crowdin).toEqual(payload);
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal,
      }),
    );
  });
});
