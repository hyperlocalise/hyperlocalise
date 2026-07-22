/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
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
import { createAssignTranslateWithAgentTool } from "./assign_translate_with_agent";

const mocks = vi.hoisted(() => ({
  enqueueExistingFileTranslationJob: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
  createTranslationJobEventQueue: vi.fn(() => ({ enqueue: vi.fn() })),
}));

vi.mock("@/lib/projects/jobs/enqueue-file-translation-job", () => ({
  enqueueExistingFileTranslationJob: (...args: unknown[]) =>
    mocks.enqueueExistingFileTranslationJob(...args),
}));

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

vi.mock("@/lib/workflow/queues", () => ({
  createTranslationJobEventQueue: () => mocks.createTranslationJobEventQueue(),
}));

function session(
  overrides: {
    outputSummary?: Record<string, unknown>;
    stepResults?: WorkspaceOrchestratorSession["stepResults"];
  } = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: "Translate on source upload",
    instructions: "",
    triggerConfig: { mode: "source_upload" },
    repositoryTarget: { kind: "none" },
    toolConfig: {
      translation: {
        enabled: true,
        projectId: "project-1",
        useProjectTargetLocales: true,
        targetLocales: [],
      },
    },
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies WorkspaceAutomationRecord;

  const run = {
    id: "run-1",
    automationId: automation.id,
    organizationId: automation.organizationId,
    triggerSource: "source_upload",
    status: "running",
    inputSnapshot: {
      projectId: "project-1",
      sourceFileId: "file-1",
      sourceFileVersionId: "version-1",
    },
    outputSummary: overrides.outputSummary ?? {
      createNativeTmsJob: {
        jobId: "job_1",
        projectId: "project-1",
      },
    },
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
    plan: { tools: ["create_native_tms_job", "assign_translate_with_agent"] },
    repository: null,
    composedInstructions: "",
    stepResults: overrides.stepResults ?? {},
    terminalStatus: null,
    terminalError: null,
  };
}

describe("createAssignTranslateWithAgentTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueExistingFileTranslationJob.mockResolvedValue({
      ok: true,
      jobId: "job_1",
      projectId: "project-1",
    });
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("enqueues the created native job for translation", async () => {
    const currentSession = session();
    const tool = createAssignTranslateWithAgentTool(currentSession);

    const result = await tool.execute!({}, { toolCallId: "call-1", messages: [] });

    expect(result).toMatchObject({
      jobId: "job_1",
      projectId: "project-1",
      action: "translate_with_agent",
      enqueued: true,
    });
    expect(mocks.enqueueExistingFileTranslationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        jobId: "job_1",
      }),
    );
    expect(currentSession.stepResults.assign_translate_with_agent).toMatchObject({
      jobId: "job_1",
      enqueued: true,
    });
  });

  it("returns the existing assign output for idempotent retries", async () => {
    const existing = {
      jobId: "job_1",
      projectId: "project-1",
      action: "translate_with_agent",
      enqueued: true,
    };
    const currentSession = session({
      outputSummary: {
        createNativeTmsJob: { jobId: "job_1", projectId: "project-1" },
        assignTranslateWithAgent: existing,
      },
    });
    const tool = createAssignTranslateWithAgentTool(currentSession);

    const result = await tool.execute!({}, { toolCallId: "call-1", messages: [] });

    expect(result).toEqual(existing);
    expect(mocks.enqueueExistingFileTranslationJob).not.toHaveBeenCalled();
  });

  it("fails when no native job is available", async () => {
    const currentSession = session({ outputSummary: {} });
    const tool = createAssignTranslateWithAgentTool(currentSession);

    await expect(tool.execute!({}, { toolCallId: "call-1", messages: [] })).rejects.toThrow(
      "native_tms_job_missing",
    );
  });
});
