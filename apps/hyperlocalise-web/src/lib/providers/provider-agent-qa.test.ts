import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import type { ExternalTmsTaskContent } from "@/lib/providers/external-tms-content-sync";

import { createProjectTestFixture } from "../../api/routes/project/project.fixture";
import * as agentRuns from "./agent-runs";
import { createAgentRun, getAgentRun } from "./agent-runs";
import { executeProviderAgentQa } from "./provider-agent-qa";

const projectFixture = createProjectTestFixture();
const pullExternalTmsTaskContentMock = vi.fn();
const runHlCheckOnProviderContentMock = vi.fn();

vi.mock("@/lib/providers/provider-job-qa/run-hl-check", () => ({
  runHlCheckOnProviderContent: (...args: unknown[]) => runHlCheckOnProviderContentMock(...args),
}));

vi.mock("@/lib/providers/external-tms-content-sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/external-tms-content-sync")>();
  return {
    ...actual,
    pullExternalTmsTaskContent: (...args: unknown[]) => pullExternalTmsTaskContentMock(...args),
  };
});

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
  pullExternalTmsTaskContentMock.mockReset();
  runHlCheckOnProviderContentMock.mockReset();
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
  externalJobId: "task-qa-1",
  sourceLocale: "en",
  targetLocales: ["fr"],
  units: [
    {
      externalStringId: "1",
      key: "hello",
      sourceText: "Hello {name}",
      translations: [{ locale: "fr", text: "Bonjour" }],
    },
  ],
};

describe("executeProviderAgentQa", () => {
  it("pulls provider content, runs QA checks, and stores findings", async () => {
    const project = await createExternalTmsProject();

    pullExternalTmsTaskContentMock.mockResolvedValue({
      runId: "pull-run-qa-1",
      counts: { unitsDiscovered: 1, translationsDiscovered: 1, approvedTranslations: 0 },
      content: pulledContent,
      failures: [],
    });
    runHlCheckOnProviderContentMock.mockResolvedValue({
      report: {
        checks: ["placeholder_mismatch"],
        findings: [
          {
            type: "placeholder_mismatch",
            severity: "error",
            locale: "fr",
            sourceFile: "content/en/strings.json",
            targetFile: "content/fr/strings.json",
            key: "hello",
            message: "Placeholder mismatch",
          },
        ],
        summary: { total: 1 },
      },
      keyManifest: {
        hello: { externalStringId: "1", key: "hello" },
      },
      workspaceRoot: "/tmp/hl-provider-qa",
    });

    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "task-qa-1",
      kind: "review",
      inputSnapshot: { projectId: project.id, action: "run_qa_checks" },
    });

    const result = await executeProviderAgentQa({
      agentRunId: run.id,
      organizationId: project.organizationId,
    });

    expect(result).toMatchObject({
      ok: true,
      pullRunId: "pull-run-qa-1",
    });
    expect(result.ok && result.report.summary.total).toBeGreaterThan(0);

    const completed = await getAgentRun({
      runId: run.id,
      organizationId: project.organizationId,
    });

    expect(completed?.status).toBe("succeeded");
    expect(completed?.changedItems).toEqual([]);
    expect(completed?.outputSummary).toMatchObject({
      pullRunId: "pull-run-qa-1",
      findingCount: expect.any(Number),
      findings: expect.any(Array),
      summary: expect.objectContaining({ total: expect.any(Number) }),
    });
  });

  it("rejects unsupported agent run kinds", async () => {
    const project = await createExternalTmsProject();

    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "task-qa-2",
      kind: "translate",
      inputSnapshot: { projectId: project.id, action: "translate_with_agent" },
    });

    const result = await executeProviderAgentQa({
      agentRunId: run.id,
      organizationId: project.organizationId,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "unsupported_agent_run_kind",
    });
    expect(pullExternalTmsTaskContentMock).not.toHaveBeenCalled();
  });

  it("fails when the provider does not support content pull", async () => {
    const project = await createExternalTmsProject();

    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "smartling",
      externalJobId: "smartling-job-qa-1",
      kind: "review",
      inputSnapshot: { projectId: project.id, action: "run_qa_checks" },
    });

    const result = await executeProviderAgentQa({
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

  it("fails when projectId is missing from the input snapshot", async () => {
    const project = await createExternalTmsProject();

    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "task-qa-3",
      kind: "review",
      inputSnapshot: { action: "run_qa_checks" },
    });

    const result = await executeProviderAgentQa({
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
      externalJobId: "task-qa-start-fail",
      kind: "review",
      inputSnapshot: { projectId: project.id, action: "run_qa_checks" },
    });

    const result = await executeProviderAgentQa({
      agentRunId: run.id,
      organizationId: project.organizationId,
    });

    startSpy.mockRestore();

    expect(result).toMatchObject({
      ok: false,
      code: "agent_run_start_failed",
    });
    expect(pullExternalTmsTaskContentMock).not.toHaveBeenCalled();
  });
});
