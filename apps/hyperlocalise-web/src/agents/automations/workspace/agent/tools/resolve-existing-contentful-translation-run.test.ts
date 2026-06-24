import { describe, expect, it, vi } from "vite-plus/test";

import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automations";

import type { WorkspaceOrchestratorSession } from "../context";
import { resolveExistingContentfulTranslationRunId } from "./resolve-existing-contentful-translation-run";

const { dbSelectMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
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

function session(outputSummary: Record<string, unknown> = {}): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: "Translate Contentful article",
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
    inputSnapshot: {},
    outputSummary,
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
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

describe("resolveExistingContentfulTranslationRunId", () => {
  it("reads the run id from prior orchestrator step results when the top-level field was erased", async () => {
    dbSelectMock.mockReset();

    const resolved = await resolveExistingContentfulTranslationRunId(
      session({
        orchestratorStepResults: {
          run_contentful_translation: {
            contentfulTranslationRunId: "contentful-run-1",
          },
        },
      }),
    );

    expect(resolved).toBe("contentful-run-1");
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("falls back to the database when no output summary field is present", async () => {
    dbSelectMock.mockReset();
    const limit = vi.fn().mockResolvedValue([{ id: "contentful-run-db" }]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    dbSelectMock.mockReturnValue({ from: vi.fn().mockReturnValue({ where }) });

    const resolved = await resolveExistingContentfulTranslationRunId(session());

    expect(resolved).toBe("contentful-run-db");
    expect(dbSelectMock).toHaveBeenCalled();
  });
});
