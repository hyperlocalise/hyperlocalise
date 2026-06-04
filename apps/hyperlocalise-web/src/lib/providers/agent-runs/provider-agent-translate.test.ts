import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import type { ExternalTmsTaskContent } from "@/lib/providers/tms-provider-types";

import { createProjectTestFixture } from "../../../api/routes/project/project.fixture";
import * as agentRuns from "../agent-runs/agent-runs";
import {
  completeAgentRun,
  createAgentRun,
  getAgentRun,
  startAgentRun,
} from "../agent-runs/agent-runs";
import { executeProviderAgentTranslation } from "./provider-agent-translate";

const projectFixture = createProjectTestFixture();
const pullExternalTmsTaskContentMock = vi.fn();
const loadOrganizationOpenAITranslationGeneratorMock = vi.fn();

const providerContentPullerMocks = vi.hoisted(() => {
  type GetProviderContentPuller = (
    providerKind: import("../organization-external-tms-provider-credentials").ExternalTmsProviderKind,
  ) => import("@/lib/providers/tms-provider-types").ExternalTmsContentPuller | null;

  const state: { actual: GetProviderContentPuller } = {
    actual: () => null,
  };
  const getProviderContentPullerMock = vi.fn((...args: Parameters<GetProviderContentPuller>) =>
    state.actual(...args),
  );

  return { state, getProviderContentPullerMock };
});

vi.mock("@/lib/providers/provider-content-pullers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/provider-content-pullers")>();
  providerContentPullerMocks.state.actual = actual.getProviderContentPuller;
  providerContentPullerMocks.getProviderContentPullerMock.mockImplementation(
    actual.getProviderContentPuller,
  );
  return {
    ...actual,
    getProviderContentPuller: (...args: Parameters<typeof actual.getProviderContentPuller>) =>
      providerContentPullerMocks.getProviderContentPullerMock(...args),
  };
});

vi.mock("@/lib/providers/tms-provider-content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/tms-provider-content")>();
  return {
    ...actual,
    pullExternalTmsTaskContent: (...args: unknown[]) => pullExternalTmsTaskContentMock(...args),
  };
});

vi.mock("@/lib/translation/load-organization-translation-generator", () => ({
  loadOrganizationOpenAITranslationGenerator: (...args: unknown[]) =>
    loadOrganizationOpenAITranslationGeneratorMock(...args),
}));

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
  pullExternalTmsTaskContentMock.mockReset();
  loadOrganizationOpenAITranslationGeneratorMock.mockReset();
  providerContentPullerMocks.getProviderContentPullerMock.mockImplementation(
    providerContentPullerMocks.state.actual,
  );
});

async function createExternalTmsProject() {
  const { project } = await projectFixture.createStoredProjectFixture();

  await db
    .update(schema.projects)
    .set({
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "123",
    })
    .where(eq(schema.projects.id, project.id));

  return project;
}

const pulledContent: ExternalTmsTaskContent = {
  externalJobId: "task-1",
  sourceLocale: "en",
  targetLocales: ["fr"],
  units: [
    {
      externalStringId: "1",
      key: "hello",
      sourceText: "Hello",
      translations: [],
    },
    {
      externalStringId: "2",
      key: "world",
      sourceText: "World",
      translations: [{ locale: "fr", text: "Monde", isApproved: true }],
    },
  ],
};

describe("executeProviderAgentTranslation", () => {
  it("pulls provider content, proposes translations, and stores changed items", async () => {
    const project = await createExternalTmsProject();

    pullExternalTmsTaskContentMock.mockResolvedValue({
      runId: "pull-run-1",
      counts: { unitsDiscovered: 2, translationsDiscovered: 1, approvedTranslations: 1 },
      content: pulledContent,
    });

    loadOrganizationOpenAITranslationGeneratorMock.mockResolvedValue({
      ok: true,
      project: { name: project.name, translationContext: project.translationContext },
      translateStringJob: vi.fn(async () => ({
        translations: [{ locale: "fr", text: "Bonjour" }],
      })),
    });

    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "task-1",
      kind: "translate",
      inputSnapshot: { projectId: project.id, action: "translate_with_agent" },
    });

    const result = await executeProviderAgentTranslation({
      agentRunId: run.id,
      organizationId: project.organizationId,
    });

    expect(result).toMatchObject({
      ok: true,
      proposedCount: 1,
      unitsProcessed: 2,
      skippedApprovedLocales: 1,
      pullRunId: "pull-run-1",
    });

    const completed = await getAgentRun({
      runId: run.id,
      organizationId: project.organizationId,
    });

    expect(completed?.status).toBe("succeeded");
    expect(completed?.changedItems).toEqual([
      expect.objectContaining({
        itemId: "1:fr",
        externalStringId: "1",
        key: "hello",
        locale: "fr",
        sourceText: "Hello",
        from: "",
        to: "Bonjour",
        reviewState: "pending",
        changedFields: ["target"],
      }),
    ]);
    expect(completed?.outputSummary).toMatchObject({
      pullRunId: "pull-run-1",
      proposedCount: 1,
      unitsProcessed: 2,
      skippedApprovedLocales: 1,
    });
  });

  it("fails when the provider does not support content pull", async () => {
    providerContentPullerMocks.getProviderContentPullerMock.mockReturnValue(null);

    const project = await createExternalTmsProject();

    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "lokalise",
      externalJobId: "lokalise-job-1",
      kind: "translate",
      inputSnapshot: { projectId: project.id, action: "translate_with_agent" },
    });

    const result = await executeProviderAgentTranslation({
      agentRunId: run.id,
      organizationId: project.organizationId,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "unsupported_provider_pull",
    });

    const failed = await getAgentRun({
      runId: run.id,
      organizationId: project.organizationId,
    });

    expect(failed?.status).toBe("failed");
    expect(pullExternalTmsTaskContentMock).not.toHaveBeenCalled();
  });

  it("pulls Smartling job content through the provider-neutral sync layer", async () => {
    const project = await createExternalTmsProject();
    await db
      .update(schema.projects)
      .set({
        externalProviderKind: "smartling",
      })
      .where(eq(schema.projects.id, project.id));

    pullExternalTmsTaskContentMock.mockResolvedValue({
      runId: "pull-run-smartling",
      status: "succeeded",
      providerKind: "smartling",
      providerCredentialId: "cred-smartling",
      projectId: project.id,
      content: pulledContent,
      counts: {
        unitsDiscovered: 2,
        translationsDiscovered: 1,
        approvedTranslations: 1,
      },
      failures: [],
    });

    loadOrganizationOpenAITranslationGeneratorMock.mockResolvedValue({
      ok: true,
      project: { name: project.name, translationContext: project.translationContext },
      translateStringJob: vi.fn(async () => ({
        translations: [{ locale: "fr", text: "Bonjour" }],
      })),
    });

    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "smartling",
      externalJobId: "smartling-job-1",
      kind: "translate",
      inputSnapshot: { projectId: project.id, action: "translate_with_agent" },
    });

    const result = await executeProviderAgentTranslation({
      agentRunId: run.id,
      organizationId: project.organizationId,
    });

    expect(result.ok).toBe(true);
    expect(pullExternalTmsTaskContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKind: "smartling",
        externalJobId: "smartling-job-1",
      }),
    );
  });

  it("fails when projectId is missing from the input snapshot", async () => {
    const project = await createExternalTmsProject();

    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "task-2",
      kind: "translate",
      inputSnapshot: { action: "translate_with_agent" },
    });

    const result = await executeProviderAgentTranslation({
      agentRunId: run.id,
      organizationId: project.organizationId,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "missing_project_id",
    });
  });

  it("fails the agent run when startAgentRun throws", async () => {
    const project = await createExternalTmsProject();

    const startSpy = vi
      .spyOn(agentRuns, "startAgentRun")
      .mockRejectedValueOnce(new Error("db unavailable"));

    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "task-start-fail",
      kind: "translate",
      inputSnapshot: { projectId: project.id, action: "translate_with_agent" },
    });

    const result = await executeProviderAgentTranslation({
      agentRunId: run.id,
      organizationId: project.organizationId,
    });

    startSpy.mockRestore();

    expect(result).toMatchObject({
      ok: false,
      code: "agent_run_start_failed",
    });
    expect(pullExternalTmsTaskContentMock).not.toHaveBeenCalled();

    const failed = await getAgentRun({
      runId: run.id,
      organizationId: project.organizationId,
    });

    expect(failed?.status).toBe("failed");
    expect(failed?.outputSummary).toMatchObject({ code: "agent_run_start_failed" });
  });

  it("fails when the translation project no longer exists", async () => {
    const project = await createExternalTmsProject();

    pullExternalTmsTaskContentMock.mockResolvedValue({
      runId: "pull-run-missing-project",
      counts: { unitsDiscovered: 1, translationsDiscovered: 0, approvedTranslations: 0 },
      content: {
        externalJobId: "task-missing-project",
        sourceLocale: "en",
        targetLocales: ["fr"],
        units: [
          {
            externalStringId: "1",
            key: "gone",
            sourceText: "Gone",
            translations: [],
          },
        ],
      },
    });

    loadOrganizationOpenAITranslationGeneratorMock.mockResolvedValue({
      ok: true,
      project: { name: project.name, translationContext: project.translationContext },
      translateStringJob: vi.fn(async () => ({
        translations: [{ locale: "fr", text: "Parti" }],
      })),
    });

    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "task-missing-project",
      kind: "translate",
      inputSnapshot: { projectId: project.id, action: "translate_with_agent" },
    });

    await db.delete(schema.projects).where(eq(schema.projects.id, project.id));

    const result = await executeProviderAgentTranslation({
      agentRunId: run.id,
      organizationId: project.organizationId,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "translation_project_not_found",
    });

    const failed = await getAgentRun({
      runId: run.id,
      organizationId: project.organizationId,
    });

    expect(failed?.status).toBe("failed");
    expect(failed?.outputSummary).toMatchObject({
      code: "translation_project_not_found",
      pullRunId: "pull-run-missing-project",
    });
    expect(failed?.warnings).toEqual(expect.arrayContaining([expect.stringContaining(project.id)]));
  });

  it("returns idempotent success when the agent run already completed", async () => {
    const project = await createExternalTmsProject();

    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "task-already-done",
      kind: "translate",
      inputSnapshot: { projectId: project.id, action: "translate_with_agent" },
    });

    await startAgentRun({
      runId: run.id,
      organizationId: project.organizationId,
    });

    await completeAgentRun({
      runId: run.id,
      organizationId: project.organizationId,
      outputSummary: {
        pullRunId: "pull-run-done",
        proposedCount: 2,
        unitsProcessed: 3,
        skippedApprovedLocales: 1,
      },
    });

    const result = await executeProviderAgentTranslation({
      agentRunId: run.id,
      organizationId: project.organizationId,
    });

    expect(result).toMatchObject({
      ok: true,
      alreadyCompleted: true,
      proposedCount: 2,
      unitsProcessed: 3,
      skippedApprovedLocales: 1,
      pullRunId: "pull-run-done",
    });
    expect(pullExternalTmsTaskContentMock).not.toHaveBeenCalled();
  });

  it("retries a running agent run after a worker crash", async () => {
    const project = await createExternalTmsProject();

    pullExternalTmsTaskContentMock.mockResolvedValue({
      runId: "pull-run-retry",
      counts: { unitsDiscovered: 1, translationsDiscovered: 0, approvedTranslations: 0 },
      content: {
        externalJobId: "task-retry",
        sourceLocale: "en",
        targetLocales: ["fr"],
        units: [
          {
            externalStringId: "1",
            key: "retry",
            sourceText: "Retry me",
            translations: [],
          },
        ],
      },
    });

    loadOrganizationOpenAITranslationGeneratorMock.mockResolvedValue({
      ok: true,
      project: { name: project.name, translationContext: project.translationContext },
      translateStringJob: vi.fn(async () => ({
        translations: [{ locale: "fr", text: "Reessayer" }],
      })),
    });

    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "task-retry",
      kind: "translate",
      inputSnapshot: { projectId: project.id, action: "translate_with_agent" },
    });

    await startAgentRun({
      runId: run.id,
      organizationId: project.organizationId,
    });

    const result = await executeProviderAgentTranslation({
      agentRunId: run.id,
      organizationId: project.organizationId,
    });

    expect(result).toMatchObject({
      ok: true,
      proposedCount: 1,
      unitsProcessed: 1,
    });

    const completed = await getAgentRun({
      runId: run.id,
      organizationId: project.organizationId,
    });

    expect(completed?.status).toBe("succeeded");
  });
});
