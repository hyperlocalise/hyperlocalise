import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automations";
import { ok } from "@/lib/primitives/result/results";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  createRunContentfulTranslationTool,
  resolveContentfulEntryId,
  resolveContentfulEntryIdForExecution,
} from "./run_contentful_translation";

const mocks = vi.hoisted(() => ({
  createContentfulTranslationRun: vi.fn(),
  runContentfulAgent: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

const { dbSelectMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
}));

vi.mock("@/agents/automations/contentful/agent/run-contentful-agent", () => ({
  runContentfulAgent: mocks.runContentfulAgent,
}));

vi.mock("@/lib/contentful/automation-executor", () => ({
  createContentfulTranslationRun: mocks.createContentfulTranslationRun,
}));

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: mocks.updateWorkspaceAutomationRun,
}));

vi.mock("@/lib/database", () => ({
  db: {
    select: dbSelectMock,
  },
  schema: {
    contentfulTranslationRuns: {
      id: "id",
      workspaceAutomationRunId: "workspaceAutomationRunId",
      organizationId: "organizationId",
      createdAt: "createdAt",
      status: "status",
      detectedFields: "detectedFields",
      writebackSummary: "writebackSummary",
      qaSummary: "qaSummary",
    },
  },
}));

function session(input: {
  inputSnapshot?: Record<string, unknown>;
  toolConfigEntryId?: string;
  automationName?: string;
  outputSummary?: Record<string, unknown>;
  stepResults?: WorkspaceOrchestratorSession["stepResults"];
}): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: input.automationName ?? "Translate Contentful article",
    instructions: "",
    triggerConfig: { mode: "contentful" },
    repositoryTarget: { kind: "none" },
    toolConfig: {
      contentful: {
        enabled: true,
        connectionId: "00000000-0000-4000-8000-000000000001",
        projectId: "00000000-0000-4000-8000-000000000002",
        sourceLocale: "en",
        targetLocales: ["fr-FR"],
        contentTypeIds: [],
        fieldMode: "auto",
        overwriteDraftLocales: false,
        runQa: true,
        writeDrafts: true,
        entryId: input.toolConfigEntryId,
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
    triggerSource: "contentful",
    status: "queued",
    inputSnapshot: input.inputSnapshot ?? {},
    outputSummary: input.outputSummary ?? {},
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
    plan: { tools: ["run_contentful_translation"] },
    repository: null,
    composedInstructions: "",
    stepResults: input.stepResults ?? {},
    terminalStatus: null,
    terminalError: null,
  };
}

afterEach(() => {
  mocks.createContentfulTranslationRun.mockReset();
  mocks.runContentfulAgent.mockReset();
  mocks.updateWorkspaceAutomationRun.mockReset();
  dbSelectMock.mockReset();
});

function mockEmptyContentfulRunLookup() {
  const limit = vi.fn().mockResolvedValue([]);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  dbSelectMock.mockReturnValue({ from: vi.fn().mockReturnValue({ where }) });
}

describe("resolveContentfulEntryId", () => {
  it("prefers the webhook snapshot entry ID over automation config", () => {
    const resolved = resolveContentfulEntryId(
      session({
        inputSnapshot: { entryId: "entry-from-webhook" },
        toolConfigEntryId: "Translate Contentful article",
      }),
    );

    expect(resolved).toBe("entry-from-webhook");
  });

  it("falls back to automation config when the snapshot has no entry ID", () => {
    const resolved = resolveContentfulEntryId(
      session({
        inputSnapshot: {},
        toolConfigEntryId: "entry-from-config",
      }),
    );

    expect(resolved).toBe("entry-from-config");
  });

  it("returns null when neither the snapshot nor automation config provides an entry ID", () => {
    const resolved = resolveContentfulEntryId(session({ inputSnapshot: {} }));

    expect(resolved).toBeNull();
  });
});

describe("resolveContentfulEntryIdForExecution", () => {
  it("ignores agent overrides when the trigger already provided an entry ID", () => {
    const resolved = resolveContentfulEntryIdForExecution(
      session({
        inputSnapshot: { entryId: "entry-from-webhook" },
      }),
      "Translate Contentful article",
    );

    expect(resolved).toBe("entry-from-webhook");
  });

  it("falls back to the agent-provided entry ID when none was preset", () => {
    const resolved = resolveContentfulEntryIdForExecution(
      session({ inputSnapshot: {} }),
      "entry-from-agent",
    );

    expect(resolved).toBe("entry-from-agent");
  });
});

describe("createRunContentfulTranslationTool", () => {
  it("binds the webhook entry ID in the tool description when the trigger provided one", () => {
    const tool = createRunContentfulTranslationTool(
      session({
        inputSnapshot: { entryId: "entry-from-webhook" },
      }),
    );

    expect(tool.description).toContain("entry-from-webhook");
  });

  it("fails idempotent retry when a completed run wrote no draft values", async () => {
    const limit = vi.fn().mockResolvedValue([
      {
        id: "contentful-run-1",
        status: "succeeded",
        detectedFields: [{ field: "title" }, { field: "body" }],
        writebackSummary: { localeValuesWritten: 0 },
        qaSummary: { total: 0 },
      },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    dbSelectMock.mockReturnValue({ from: vi.fn().mockReturnValue({ where }) });

    const testSession = session({
      inputSnapshot: { entryId: "entry-from-webhook" },
      outputSummary: { contentfulTranslationRunId: "contentful-run-1" },
    });
    const tool = createRunContentfulTranslationTool(testSession);

    if (!tool.execute) {
      throw new Error("run_contentful_translation tool is missing execute");
    }

    const result = await tool.execute({}, { toolCallId: "test-tool-call", messages: [] });

    expect(mocks.createContentfulTranslationRun).not.toHaveBeenCalled();
    expect(mocks.runContentfulAgent).not.toHaveBeenCalled();
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        organizationId: "org-1",
        status: "failed",
        error: { message: "contentful_no_draft_writebacks" },
      }),
    );
    expect(result).toEqual({
      contentfulTranslationRunId: "contentful-run-1",
      status: "failed",
      message: "contentful_no_draft_writebacks",
      fieldsDetected: 2,
      localeValuesWritten: 0,
    });
    expect(testSession.terminalStatus).toBe("failed");
    expect(testSession.terminalError).toBe("contentful_no_draft_writebacks");
    expect(testSession.stepResults.run_contentful_translation).toEqual(result);
  });

  it("returns the completed summary without re-running translation on retry", async () => {
    const limit = vi.fn().mockResolvedValue([
      {
        id: "contentful-run-1",
        status: "succeeded",
        detectedFields: [{ field: "title" }],
        writebackSummary: { localeValuesWritten: 3 },
        qaSummary: { total: 1 },
      },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    dbSelectMock.mockReturnValue({ from: vi.fn().mockReturnValue({ where }) });

    const testSession = session({
      inputSnapshot: { entryId: "entry-from-webhook" },
      outputSummary: { contentfulTranslationRunId: "contentful-run-1" },
    });
    const tool = createRunContentfulTranslationTool(testSession);

    if (!tool.execute) {
      throw new Error("run_contentful_translation tool is missing execute");
    }

    const result = await tool.execute({}, { toolCallId: "test-tool-call", messages: [] });

    expect(mocks.createContentfulTranslationRun).not.toHaveBeenCalled();
    expect(mocks.runContentfulAgent).not.toHaveBeenCalled();
    expect(result).toEqual({
      contentfulTranslationRunId: "contentful-run-1",
      status: "succeeded",
      runId: "contentful-run-1",
      fieldsDetected: 1,
      localeValuesWritten: 3,
      qaFindingCount: 1,
    });
    expect(testSession.terminalStatus).toBe("succeeded");
    expect(testSession.run.outputSummary.contentfulTranslationRunId).toBe("contentful-run-1");
    expect(testSession.stepResults.run_contentful_translation).toEqual(result);
  });

  it("fails the workspace run when fields are detected but no draft values are written", async () => {
    mockEmptyContentfulRunLookup();
    mocks.createContentfulTranslationRun.mockResolvedValue({ id: "contentful-run-1" });
    mocks.runContentfulAgent.mockResolvedValue(
      ok({
        runId: "contentful-run-1",
        fieldsDetected: 2,
        localeValuesWritten: 0,
        qaFindingCount: 0,
      }),
    );

    const testSession = session({
      inputSnapshot: { entryId: "entry-from-webhook", contentTypeId: "article" },
    });
    const tool = createRunContentfulTranslationTool(testSession);

    if (!tool.execute) {
      throw new Error("run_contentful_translation tool is missing execute");
    }

    const result = await tool.execute({}, { toolCallId: "test-tool-call", messages: [] });

    expect(mocks.createContentfulTranslationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        workspaceAutomationRunId: "run-1",
        entryId: "entry-from-webhook",
        contentTypeId: "article",
        sourceLocale: "en",
        targetLocales: ["fr-FR"],
        writeDrafts: true,
      }),
    );
    expect(mocks.runContentfulAgent).toHaveBeenCalledWith(
      {
        contentfulTranslationRunId: "contentful-run-1",
        workspaceAutomationRunId: "run-1",
        organizationId: "org-1",
      },
      { manageWorkspaceRunStatus: false },
    );
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledTimes(3);
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        runId: "run-1",
        organizationId: "org-1",
        status: "failed",
        error: { message: "contentful_no_draft_writebacks" },
      }),
    );
    expect(testSession.terminalStatus).toBe("failed");
    expect(testSession.terminalError).toBe("contentful_no_draft_writebacks");
    expect(result).toEqual({
      contentfulTranslationRunId: "contentful-run-1",
      status: "failed",
      message: "contentful_no_draft_writebacks",
      fieldsDetected: 2,
      localeValuesWritten: 0,
    });
    expect(testSession.stepResults.run_contentful_translation).toEqual(result);
  });
});
