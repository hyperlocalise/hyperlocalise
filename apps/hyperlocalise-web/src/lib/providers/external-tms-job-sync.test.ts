import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { createProjectTestFixture } from "../../api/routes/project/project.fixture";
import {
  syncExternalTmsJobTasks,
  type ExternalTmsJobTaskFetcher,
} from "./sync/external-tms-job-sync";
import { upsertOrganizationExternalTmsProviderCredential } from "./organization-external-tms-provider-credentials";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

async function createExternalTmsProject(input?: { providerKind?: "phrase" | "crowdin" }) {
  const { organization, user, project } = await projectFixture.createStoredProjectFixture();
  const providerKind = input?.providerKind ?? "phrase";
  const credential = await upsertOrganizationExternalTmsProviderCredential({
    organizationId: organization.id,
    userId: user.id,
    role: "admin",
    providerKind,
    displayName: providerKind,
    secretMaterial: "secret-token",
    baseUrl: "https://api.example.test",
  });

  const [externalProject] = await db
    .update(schema.projects)
    .set({
      source: "external_tms",
      externalProviderCredentialId: credential.id,
      externalProviderKind: providerKind,
      externalProjectId: `${providerKind}-project-1`,
      targetLocales: ["fr-FR", "de-DE"],
    })
    .where(eq(schema.projects.id, project.id))
    .returning();

  return { organization, user, credential, project: externalProject };
}

describe("syncExternalTmsJobTasks", () => {
  it("fetches provider jobs and tasks, then upserts normalized database jobs", async () => {
    const { organization, credential, project } = await createExternalTmsProject({
      providerKind: "phrase",
    });
    const fetchJobTasks: ExternalTmsJobTaskFetcher = async ({
      credential: fetchedCredential,
      externalProjectId,
      secretMaterial,
    }) => {
      expect(fetchedCredential.id).toBe(credential.id);
      expect(externalProjectId).toBe("phrase-project-1");
      expect(secretMaterial).toBe("secret-token");

      return [
        {
          externalJobId: "phrase-job-1-task-fr",
          externalTaskId: "task-fr",
          externalStatus: "new",
          title: "Homepage French",
          targetLocales: ["fr-FR"],
          assignedUsers: ["translator@example.com"],
          dueDate: "2026-06-01T00:00:00.000Z",
          externalUrl: "https://phrase.example.test/jobs/phrase-job-1/tasks/task-fr",
          providerPayload: { workflowStep: "translation" },
        },
        {
          externalJobId: "phrase-job-1-task-de",
          externalTaskId: "task-de",
          externalStatus: "in_progress",
          title: "Homepage German",
          targetLocales: ["de-DE"],
        },
      ];
    };

    const result = await syncExternalTmsJobTasks({
      organizationId: organization.id,
      projectId: project.id,
      providerKind: "phrase",
      fetchJobTasks,
    });

    expect(result.status).toBe("succeeded");
    expect(result.counts).toEqual({
      jobTasksDiscovered: 2,
      jobTasksSynced: 2,
      jobTasksFailed: 0,
      statusesChanged: 0,
    });

    const jobs = await db
      .select({
        status: schema.jobs.status,
        externalJobId: schema.externalJobDetails.externalJobId,
        externalTaskId: schema.externalJobDetails.externalTaskId,
        title: schema.externalJobDetails.title,
        targetLocales: schema.externalJobDetails.targetLocales,
      })
      .from(schema.externalJobDetails)
      .innerJoin(schema.jobs, eq(schema.jobs.id, schema.externalJobDetails.jobId))
      .where(eq(schema.jobs.projectId, project.id));

    expect(jobs).toHaveLength(2);
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "queued",
          externalJobId: "phrase-job-1-task-fr",
          externalTaskId: "task-fr",
          title: "Homepage French",
          targetLocales: ["fr-FR"],
        }),
        expect.objectContaining({
          status: "running",
          externalJobId: "phrase-job-1-task-de",
          externalTaskId: "task-de",
          title: "Homepage German",
          targetLocales: ["de-DE"],
        }),
      ]),
    );
  });

  it("updates existing normalized statuses without creating duplicate jobs", async () => {
    const { organization, project } = await createExternalTmsProject({ providerKind: "crowdin" });

    await syncExternalTmsJobTasks({
      organizationId: organization.id,
      projectId: project.id,
      providerKind: "crowdin",
      fetchJobTasks: async () => [
        {
          externalJobId: "crowdin-job-1",
          externalStatus: "todo",
          title: "Docs",
        },
      ],
    });

    const second = await syncExternalTmsJobTasks({
      organizationId: organization.id,
      projectId: project.id,
      providerKind: "crowdin",
      fetchJobTasks: async () => [
        {
          externalJobId: "crowdin-job-1",
          externalStatus: "done",
          title: "Docs complete",
        },
      ],
    });

    expect(second.counts).toEqual({
      jobTasksDiscovered: 1,
      jobTasksSynced: 1,
      jobTasksFailed: 0,
      statusesChanged: 1,
    });

    const jobs = await db
      .select({
        status: schema.jobs.status,
        completedAt: schema.jobs.completedAt,
        title: schema.externalJobDetails.title,
      })
      .from(schema.externalJobDetails)
      .innerJoin(schema.jobs, eq(schema.jobs.id, schema.externalJobDetails.jobId))
      .where(eq(schema.jobs.projectId, project.id));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      status: "succeeded",
      title: "Docs complete",
    });
    expect(jobs[0]?.completedAt).toBeTruthy();
  });

  it("records a failed run when provider job fetching fails", async () => {
    const { organization, project } = await createExternalTmsProject();

    await expect(
      syncExternalTmsJobTasks({
        organizationId: organization.id,
        projectId: project.id,
        providerKind: "phrase",
        fetchJobTasks: async () => {
          throw new Error("Phrase returned HTTP 429 while listing jobs");
        },
      }),
    ).rejects.toThrow("Phrase returned HTTP 429 while listing jobs");

    const [run] = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(eq(schema.providerSyncRuns.organizationId, organization.id));

    expect(run?.kind).toBe("job_task_scan");
    expect(run?.status).toBe("failed");
    expect(run?.errorMessage).toBe("Phrase returned HTTP 429 while listing jobs");
  });
});
