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
import { createNativeTmsJobTool } from "./create_native_tms_job";

const mocks = vi.hoisted(() => ({
  createFileTranslationJob: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
  selectLimit: vi.fn(),
}));

vi.mock("@/lib/projects/jobs/enqueue-file-translation-job", () => ({
  createFileTranslationJob: (...args: unknown[]) => mocks.createFileTranslationJob(...args),
}));

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

vi.mock("@/lib/database", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mocks.selectLimit,
        })),
      })),
    })),
  },
  schema: {
    projects: {
      id: "id",
      sourceLocale: "sourceLocale",
      targetLocales: "targetLocales",
    },
  },
}));

function session(
  overrides: {
    outputSummary?: Record<string, unknown>;
    stepResults?: WorkspaceOrchestratorSession["stepResults"];
    inputSnapshot?: Record<string, unknown>;
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
    inputSnapshot: overrides.inputSnapshot ?? {
      projectId: "project-1",
      sourceFileId: "file-1",
      sourceFileVersionId: "version-1",
      sourcePath: "locales/en.json",
    },
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
    plan: { tools: ["create_native_tms_job", "assign_translate_with_agent"] },
    repository: null,
    composedInstructions: "",
    stepResults: overrides.stepResults ?? {},
    terminalStatus: null,
    terminalError: null,
  };
}

describe("createNativeTmsJobTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectLimit.mockResolvedValue([
      {
        sourceLocale: "en",
        targetLocales: ["fr-FR", "de-DE"],
      },
    ]);
    mocks.createFileTranslationJob.mockResolvedValue({
      ok: true,
      jobId: "job_1",
      projectId: "project-1",
      sourceFileVersionId: "version-1",
    });
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("creates a native file translation job without enqueueing", async () => {
    const currentSession = session();
    const tool = createNativeTmsJobTool(currentSession);

    const result = await tool.execute!(
      { summary: "from upload" },
      {
        toolCallId: "call-1",
        messages: [],
      },
    );

    expect(result).toMatchObject({
      jobId: "job_1",
      projectId: "project-1",
      sourceFileId: "file-1",
      targetLocales: ["fr-FR", "de-DE"],
      summary: "from upload",
    });
    expect(mocks.createFileTranslationJob).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "project-1",
      sourceFileId: "file-1",
      sourceLocale: "en",
      targetLocales: ["fr-FR", "de-DE"],
    });
    expect(currentSession.stepResults.create_native_tms_job).toMatchObject({ jobId: "job_1" });
  });

  it("returns the existing create output for idempotent retries", async () => {
    const existing = {
      jobId: "job_existing",
      projectId: "project-1",
      sourceFileId: "file-1",
      sourceFileVersionId: "version-1",
      targetLocales: ["fr-FR"],
    };
    const currentSession = session({ outputSummary: { createNativeTmsJob: existing } });
    const tool = createNativeTmsJobTool(currentSession);

    const result = await tool.execute!({}, { toolCallId: "call-1", messages: [] });

    expect(result).toEqual(existing);
    expect(mocks.createFileTranslationJob).not.toHaveBeenCalled();
  });
});
