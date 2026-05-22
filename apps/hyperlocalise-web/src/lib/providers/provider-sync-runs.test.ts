import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { createProjectTestFixture } from "../../api/routes/project/project.fixture";
import {
  completeProviderSyncRun,
  failProviderSyncRun,
  listProviderSyncRuns,
  recordProviderSyncRun,
  startProviderSyncRun,
} from "./provider-sync-runs";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

async function createTestProject() {
  const { project } = await projectFixture.createStoredProjectFixture();
  return project;
}

describe("provider sync runs", () => {
  it("records successful provider sync run details", async () => {
    const project = await createTestProject();

    const started = await startProviderSyncRun({
      organizationId: project.organizationId,
      providerKind: "phrase",
      kind: "project_scan",
      projectId: project.id,
      externalProjectId: "phrase-project-1",
      resourceType: "project",
      resourceId: project.id,
      externalResourceId: "phrase-project-1",
      providerMetadata: { requestId: "req_123" },
    });

    expect(started.status).toBe("running");
    expect(started.completedAt).toBeNull();

    const completed = await completeProviderSyncRun({
      runId: started.id,
      organizationId: project.organizationId,
      counts: { projects: 1, locales: 2 },
      providerMetadata: { requestId: "req_456" },
    });

    expect(completed.status).toBe("succeeded");
    expect(completed.completedAt).toBeTruthy();
    expect(completed.counts).toEqual({ projects: 1, locales: 2 });
    expect(completed.providerMetadata).toEqual({ requestId: "req_456" });
  });

  it("records actionable failure details", async () => {
    const project = await createTestProject();

    const started = await startProviderSyncRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      kind: "job_task_scan",
      projectId: project.id,
      resourceType: "job",
      externalResourceId: "crowdin-job-1",
    });

    const failed = await failProviderSyncRun({
      runId: started.id,
      organizationId: project.organizationId,
      errorMessage: "Crowdin returned HTTP 429 while listing jobs",
      errorDetails: { status: 429, retryAfterSeconds: 60 },
      counts: { jobs: 0 },
    });

    expect(failed.status).toBe("failed");
    expect(failed.errorMessage).toBe("Crowdin returned HTTP 429 while listing jobs");
    expect(failed.errorDetails).toEqual({ status: 429, retryAfterSeconds: 60 });
    expect(failed.counts).toEqual({ jobs: 0 });
  });

  it("queries recent runs by organization, provider, project, and resource", async () => {
    const project = await createTestProject();

    await startProviderSyncRun({
      organizationId: project.organizationId,
      providerKind: "smartling",
      kind: "file_key_scan",
      projectId: project.id,
      resourceType: "file",
      resourceId: "file_1",
    });
    await startProviderSyncRun({
      organizationId: project.organizationId,
      providerKind: "lokalise",
      kind: "file_key_scan",
      projectId: project.id,
      resourceType: "file",
      resourceId: "file_2",
    });

    const runs = await listProviderSyncRuns({
      organizationId: project.organizationId,
      providerKind: "smartling",
      projectId: project.id,
      resourceType: "file",
      resourceId: "file_1",
    });

    expect(runs).toHaveLength(1);
    expect(runs[0]?.providerKind).toBe("smartling");
    expect(runs[0]?.resourceId).toBe("file_1");
  });

  it("wraps connector operations and marks failures", async () => {
    const project = await createTestProject();

    await expect(
      recordProviderSyncRun(
        {
          organizationId: project.organizationId,
          providerKind: "phrase",
          kind: "health_check",
        },
        async () => {
          throw new Error("Phrase health check timed out");
        },
      ),
    ).rejects.toThrow("Phrase health check timed out");

    const [run] = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(eq(schema.providerSyncRuns.organizationId, project.organizationId));

    expect(run?.status).toBe("failed");
    expect(run?.errorMessage).toBe("Phrase health check timed out");
  });
});
