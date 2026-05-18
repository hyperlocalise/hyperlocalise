import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";
import { createProjectTestFixture } from "./project.fixture";
import type { JobRecord, WorkspaceJobRecord } from "./job.schema";
import type { ProjectResponse } from "./project.schema";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(() => globalThis.__testApiAuthContext ?? null),
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

function createInlineTestJobQueue(): JobQueue<TranslationJobEventData> {
  return {
    async enqueue(event) {
      return { ids: [event.jobId] };
    },
  };
}

const client = testClient(createApp({ jobQueue: createInlineTestJobQueue() }));
const appClient = client;
const projectFixture = createProjectTestFixture(client);
const {
  authHeadersFor,
  cleanup,
  createProjectViaApi,
  createWorkosIdentity,
  createWorkosIdentityForOrganization,
  getLocalUserId,
} = projectFixture;

async function insertJob(params: {
  projectId: string;
  createdByUserId: string | null;
  type: "string" | "file";
  status: "queued" | "running" | "succeeded" | "failed";
  inputPayload: Record<string, unknown>;
  outcomeKind?: "string_result" | "file_result" | "error";
  outcomePayload?: Record<string, unknown>;
  lastError?: string;
  workflowRunId?: string;
}) {
  const [project] = await db
    .select({ organizationId: schema.projects.organizationId })
    .from(schema.projects)
    .where(eq(schema.projects.id, params.projectId))
    .limit(1);

  if (!project) {
    throw new Error(`project ${params.projectId} not found`);
  }

  const job = await db.transaction(async (tx) => {
    const [createdJob] = await tx
      .insert(schema.jobs)
      .values({
        id: `job_${randomUUID()}`,
        organizationId: project.organizationId,
        projectId: params.projectId,
        createdByUserId: params.createdByUserId,
        kind: "translation",
        status: params.status,
        inputPayload: params.inputPayload,
        outcomePayload: params.outcomePayload ?? null,
        lastError: params.lastError ?? null,
        workflowRunId: params.workflowRunId ?? null,
        completedAt:
          params.status === "succeeded" || params.status === "failed" ? new Date() : null,
      })
      .returning();

    const [details] = await tx
      .insert(schema.translationJobDetails)
      .values({
        jobId: createdJob.id,
        type: params.type,
        outcomeKind: params.outcomeKind ?? null,
      })
      .returning();

    return { ...createdJob, type: details.type, outcomeKind: details.outcomeKind };
  });

  return job;
}

async function insertResearchJob(params: {
  projectId: string;
  createdByUserId: string | null;
  status?: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
  inputPayload: Record<string, unknown>;
}) {
  const [project] = await db
    .select({ organizationId: schema.projects.organizationId })
    .from(schema.projects)
    .where(eq(schema.projects.id, params.projectId))
    .limit(1);

  if (!project) {
    throw new Error(`project ${params.projectId} not found`);
  }

  const [job] = await db
    .insert(schema.jobs)
    .values({
      id: `job_${randomUUID()}`,
      organizationId: project.organizationId,
      projectId: params.projectId,
      createdByUserId: params.createdByUserId,
      kind: "research",
      status: params.status ?? "queued",
      inputPayload: params.inputPayload,
    })
    .returning();

  return job;
}

async function insertStoredSourceFile(params: {
  projectId: string;
  filename?: string;
  contentType?: string;
  organizationId?: string;
}) {
  const [project] = await db
    .select({ organizationId: schema.projects.organizationId })
    .from(schema.projects)
    .where(eq(schema.projects.id, params.projectId))
    .limit(1);

  if (!project && !params.organizationId) {
    throw new Error(`project ${params.projectId} not found`);
  }

  const id = `file_${randomUUID()}`;
  const filename = params.filename ?? "source.json";
  const [file] = await db
    .insert(schema.storedFiles)
    .values({
      id,
      organizationId: params.organizationId ?? project!.organizationId,
      projectId: params.projectId,
      role: "source",
      sourceKind: "chat_upload",
      storageProvider: "vercel_blob",
      storageKey: `test/${id}/${filename}`,
      storageUrl: `https://example.com/${id}/${filename}`,
      downloadUrl: `https://example.com/${id}/${filename}?download=1`,
      filename,
      contentType: params.contentType ?? "application/json",
      byteSize: 2,
      sha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
      metadata: {},
    })
    .returning();

  if (!file) {
    throw new Error("stored file insert failed");
  }

  return file;
}

afterEach(async () => {
  vi.clearAllMocks();
  await cleanup();
});

describe("jobRoutes", () => {
  it("keeps job routes mounted at nested project and workspace app paths", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const localUserId = await getLocalUserId(identity.user.workosUserId);
    const job = await insertJob({
      projectId: project.id,
      createdByUserId: localUserId,
      type: "string",
      status: "queued",
      inputPayload: {
        sourceText: "Mounted job",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    });
    const headers = await authHeadersFor(identity);

    const nestedResponse = await appClient.api.project[":projectId"].jobs[":jobId"].$get(
      {
        param: { projectId: project.id, jobId: job.id },
      },
      { headers },
    );

    expect(nestedResponse.status).toBe(200);
    await expect(nestedResponse.json()).resolves.toMatchObject({
      job: expect.objectContaining({ id: job.id }),
    });

    const workspaceResponse = await appClient.api.orgs[":organizationSlug"].jobs[":jobId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: job.id,
        },
      },
      { headers },
    );

    expect(workspaceResponse.status).toBe(200);
    await expect(workspaceResponse.json()).resolves.toMatchObject({
      job: expect.objectContaining({ id: job.id, projectName: expect.any(String) }),
    });
  });

  it("creates a queued string job", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;

    const response = await client.api.project[":projectId"].jobs.$post(
      {
        param: { projectId: project.id },
        json: {
          type: "string",
          stringInput: {
            sourceText: "Hello world",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR", "de-DE"],
            context: "Homepage hero",
            metadata: {
              screen: "hero",
            },
          },
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(201);

    const body = (await response.json()) as { job: JobRecord };
    expect(body.job.id).toMatch(/^job_/);
    expect(body.job.projectId).toBe(project.id);
    expect(body.job.type).toBe("string");
    expect(body.job.status).toBe("queued");
    expect(body.job.inputPayload).toEqual({
      sourceText: "Hello world",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR", "de-DE"],
      context: "Homepage hero",
      metadata: {
        screen: "hero",
      },
    });
    expect(body.job.workflowRunId).toBeNull();
  });

  it("lists project jobs and applies type and status filters", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const authHeader = await authHeadersFor(identity);
    const localUserId = await getLocalUserId(identity.user.workosUserId);
    const teammateIdentity = createWorkosIdentityForOrganization(identity.organization, "admin");
    await authHeadersFor(teammateIdentity);
    const teammateLocalUserId = await getLocalUserId(teammateIdentity.user.workosUserId);
    await authHeadersFor(identity);

    await insertJob({
      projectId: project.id,
      createdByUserId: localUserId,
      type: "string",
      status: "queued",
      inputPayload: {
        sourceText: "Hello",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    });

    await insertJob({
      projectId: project.id,
      createdByUserId: localUserId,
      type: "file",
      status: "failed",
      inputPayload: {
        sourceFileId: "file_123",
        fileFormat: "xliff",
        sourceLocale: "en-US",
        targetLocales: ["ja-JP"],
      },
      outcomeKind: "error",
      outcomePayload: {
        code: "CODE_INTERNAL",
        message: "Translation worker failed",
        details: {},
      },
      lastError: "Translation worker failed",
    });

    await insertJob({
      projectId: project.id,
      createdByUserId: teammateLocalUserId,
      type: "string",
      status: "running",
      inputPayload: {
        sourceText: "Team job",
        sourceLocale: "en-US",
        targetLocales: ["it-IT"],
      },
    });

    const allResponse = await client.api.project[":projectId"].jobs.$get(
      {
        param: { projectId: project.id },
        query: { mine: "false", limit: "50" },
      },
      { headers: authHeader },
    );

    expect(allResponse.status).toBe(200);
    await expect(allResponse.json()).resolves.toMatchObject({
      jobs: expect.arrayContaining([
        expect.objectContaining({ type: "string", status: "queued" }),
        expect.objectContaining({ type: "file", status: "failed" }),
        expect.objectContaining({ type: "string", status: "running" }),
      ]),
    });

    const mineResponse = await client.api.project[":projectId"].jobs.$get(
      {
        param: { projectId: project.id },
        query: { mine: "true", limit: "50" },
      },
      { headers: authHeader },
    );

    expect(mineResponse.status).toBe(200);
    const mineBody = (await mineResponse.json()) as { jobs: JobRecord[] };
    expect(mineBody).toEqual({
      jobs: expect.arrayContaining([
        expect.objectContaining({ createdByUserId: localUserId, status: "queued" }),
        expect.objectContaining({ createdByUserId: localUserId, status: "failed" }),
      ]),
    });
    expect(mineBody.jobs).toHaveLength(2);
    expect(mineBody.jobs.every((job) => job.createdByUserId === localUserId)).toBe(true);

    const filteredResponse = await client.api.project[":projectId"].jobs.$get(
      {
        param: { projectId: project.id },
        query: { type: "file", status: "failed", mine: "false", limit: "50" },
      },
      { headers: authHeader },
    );

    expect(filteredResponse.status).toBe(200);
    await expect(filteredResponse.json()).resolves.toEqual({
      jobs: [expect.objectContaining({ type: "file", status: "failed" })],
    });

    const limitedResponse = await client.api.project[":projectId"].jobs.$get(
      {
        param: { projectId: project.id },
        query: { mine: "false", limit: "1" },
      },
      { headers: authHeader },
    );

    expect(limitedResponse.status).toBe(200);
    await expect(limitedResponse.json()).resolves.toEqual({
      jobs: [expect.any(Object)],
    });
  });

  it("lists workspace jobs across projects with one global limit", async () => {
    const identity = createWorkosIdentity();
    const firstProjectResponse = await createProjectViaApi(identity);
    const firstProject = ((await firstProjectResponse.json()) as ProjectResponse).project;
    const secondProjectResponse = await createProjectViaApi(identity);
    const secondProject = ((await secondProjectResponse.json()) as ProjectResponse).project;
    const authHeader = await authHeadersFor(identity);
    const localUserId = await getLocalUserId(identity.user.workosUserId);

    await insertJob({
      projectId: firstProject.id,
      createdByUserId: localUserId,
      type: "string",
      status: "queued",
      inputPayload: {
        sourceText: "First project job",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    });
    await insertJob({
      projectId: secondProject.id,
      createdByUserId: localUserId,
      type: "string",
      status: "failed",
      inputPayload: {
        sourceText: "Second project job",
        sourceLocale: "en-US",
        targetLocales: ["de-DE"],
      },
    });

    const response = await client.api.orgs[":organizationSlug"].jobs.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        query: { mine: "true", limit: "1" },
      },
      { headers: authHeader },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { jobs: WorkspaceJobRecord[] };
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]?.createdByUserId).toBe(localUserId);
    expect(body.jobs[0]?.projectName).toEqual(expect.any(String));
  });

  it("lists non-translation jobs in project and workspace job feeds", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const localUserId = await getLocalUserId(identity.user.workosUserId);
    const authHeader = await authHeadersFor(identity);

    const researchJob = await insertResearchJob({
      projectId: project.id,
      createdByUserId: localUserId,
      status: "waiting_for_review",
      inputPayload: {
        scope: "cultural reference viability",
        targetLocales: ["ja-JP"],
      },
    });

    const projectJobsResponse = await client.api.project[":projectId"].jobs.$get(
      {
        param: { projectId: project.id },
        query: { kind: "research", mine: "false", limit: "50" },
      },
      { headers: authHeader },
    );

    expect(projectJobsResponse.status).toBe(200);
    await expect(projectJobsResponse.json()).resolves.toEqual({
      jobs: [
        expect.objectContaining({
          id: researchJob.id,
          kind: "research",
          type: null,
          status: "waiting_for_review",
        }),
      ],
    });

    const workspaceJobResponse = await client.api.orgs[":organizationSlug"].jobs[":jobId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: researchJob.id,
        },
      },
      { headers: authHeader },
    );

    expect(workspaceJobResponse.status).toBe(200);
    await expect(workspaceJobResponse.json()).resolves.toEqual({
      job: expect.objectContaining({
        id: researchJob.id,
        kind: "research",
        projectName: expect.any(String),
      }),
    });
  });

  it("returns a full job record and a lightweight status view", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const localUserId = await getLocalUserId(identity.user.workosUserId);

    const job = await insertJob({
      projectId: project.id,
      createdByUserId: localUserId,
      type: "string",
      status: "succeeded",
      inputPayload: {
        sourceText: "Sign in",
        sourceLocale: "en-US",
        targetLocales: ["es-ES"],
      },
      outcomeKind: "string_result",
      outcomePayload: {
        translations: [{ locale: "es-ES", text: "Iniciar sesion" }],
      },
      workflowRunId: "run_test",
    });

    const authHeader = await authHeadersFor(identity);

    const getResponse = await client.api.project[":projectId"].jobs[":jobId"].$get(
      {
        param: { projectId: project.id, jobId: job.id },
      },
      { headers: authHeader },
    );

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual({
      job: expect.objectContaining({
        id: job.id,
        outcomeKind: "string_result",
        workflowRunId: "run_test",
      }),
    });

    const statusResponse = await client.api.project[":projectId"].jobs[":jobId"].status.$get(
      {
        param: { projectId: project.id, jobId: job.id },
      },
      { headers: authHeader },
    );

    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toEqual({
      job: expect.objectContaining({
        id: job.id,
        projectId: project.id,
        type: "string",
        status: "succeeded",
        lastError: null,
      }),
    });
  });

  it("retries a stale queued translation job from workspace job details", async () => {
    const queuedEvents: TranslationJobEventData[] = [];
    const retryClient = testClient(
      createApp({
        jobQueue: {
          async enqueue(event) {
            queuedEvents.push(event);
            return { ids: [`run_${event.jobId}`] };
          },
        },
      }),
    );
    const retryFixture = createProjectTestFixture(retryClient);
    const identity = retryFixture.createWorkosIdentity();
    const projectResponse = await retryFixture.createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const localUserId = await retryFixture.getLocalUserId(identity.user.workosUserId);
    const job = await insertJob({
      projectId: project.id,
      createdByUserId: localUserId,
      type: "string",
      status: "queued",
      inputPayload: {
        sourceText: "Hello world",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
      outcomeKind: "error",
      outcomePayload: {
        code: "workflow_failed",
        message: "workflow failed before claiming",
      },
      lastError: "workflow failed before claiming",
      workflowRunId: "run_stale",
    });

    const response = await retryClient.api.orgs[":organizationSlug"].jobs[":jobId"].retry.$post(
      {
        param: {
          organizationSlug: identity.organization.slug!,
          jobId: job.id,
        },
      },
      {
        headers: await retryFixture.authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      job: expect.objectContaining({
        id: job.id,
        status: "queued",
        workflowRunId: null,
        lastError: null,
        outcomePayload: null,
        outcomeKind: null,
      }),
    });
    expect(queuedEvents).toEqual([
      {
        kind: "translation",
        jobId: job.id,
        projectId: project.id,
        type: "string",
      },
    ]);

    await retryFixture.cleanup();
  });

  it("does not clear details or enqueue when a retryable job is claimed concurrently", async () => {
    const queuedEvents: TranslationJobEventData[] = [];
    const retryClient = testClient(
      createApp({
        jobQueue: {
          async enqueue(event) {
            queuedEvents.push(event);
            return { ids: [`run_${event.jobId}`] };
          },
        },
      }),
    );
    const retryFixture = createProjectTestFixture(retryClient);
    const identity = retryFixture.createWorkosIdentity();
    const projectResponse = await retryFixture.createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const localUserId = await retryFixture.getLocalUserId(identity.user.workosUserId);
    const job = await insertJob({
      projectId: project.id,
      createdByUserId: localUserId,
      type: "string",
      status: "queued",
      inputPayload: {
        sourceText: "Hello world",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
      outcomeKind: "error",
      outcomePayload: {
        code: "workflow_failed",
        message: "workflow failed before claiming",
      },
      lastError: "workflow failed before claiming",
      workflowRunId: "run_stale",
    });
    const originalTransaction = db.transaction.bind(db);
    const transactionSpy = vi.spyOn(db, "transaction").mockImplementation(async (callback) => {
      await db.update(schema.jobs).set({ status: "running" }).where(eq(schema.jobs.id, job.id));

      return originalTransaction(callback);
    });

    try {
      const response = await retryClient.api.orgs[":organizationSlug"].jobs[":jobId"].retry.$post(
        {
          param: {
            organizationSlug: identity.organization.slug!,
            jobId: job.id,
          },
        },
        {
          headers: await retryFixture.authHeadersFor(identity),
        },
      );

      expect(response.status).toBe(409);
      const responseBody = await response.json();
      expect(responseBody).toMatchObject({
        error: "job_action_unavailable",
        message: expect.any(String),
      });
      expect(queuedEvents).toEqual([]);

      const [details] = await db
        .select({
          status: schema.jobs.status,
          outcomeKind: schema.translationJobDetails.outcomeKind,
        })
        .from(schema.jobs)
        .innerJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .where(eq(schema.jobs.id, job.id))
        .limit(1);

      expect(details).toEqual({ status: "running", outcomeKind: "error" });
    } finally {
      transactionSpy.mockRestore();
      await retryFixture.cleanup();
    }
  });

  it("marks an active workspace job as failed", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const localUserId = await getLocalUserId(identity.user.workosUserId);
    const job = await insertJob({
      projectId: project.id,
      createdByUserId: localUserId,
      type: "string",
      status: "running",
      inputPayload: {
        sourceText: "Hello world",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
      workflowRunId: "run_active",
    });

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"]["mark-failed"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug!,
          jobId: job.id,
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      job: expect.objectContaining({
        id: job.id,
        status: "failed",
        workflowRunId: null,
        lastError: "Marked failed by user",
        outcomeKind: "error",
        outcomePayload: {
          code: "manual_failure",
          message: "Marked failed by user",
        },
        completedAt: expect.any(String),
      }),
    });
  });

  it("returns 403 when a member creates a translation job", async () => {
    const ownerIdentity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(ownerIdentity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;

    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );
    const response = await client.api.project[":projectId"].jobs.$post(
      {
        param: { projectId: project.id },
        json: {
          type: "string",
          stringInput: {
            sourceText: "Hello world",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      {
        headers: await authHeadersFor(memberIdentity),
      },
    );

    expect(response.status).toBe(403);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "forbidden", message: expect.any(String) });
  });

  it("returns 404 when another organization fetches a job", async () => {
    const ownerIdentity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(ownerIdentity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const localUserId = await getLocalUserId(ownerIdentity.user.workosUserId);

    const job = await insertJob({
      projectId: project.id,
      createdByUserId: localUserId,
      type: "string",
      status: "queued",
      inputPayload: {
        sourceText: "Hello",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    });

    const otherIdentity = createWorkosIdentity();
    const response = await client.api.project[":projectId"].jobs[":jobId"].$get(
      {
        param: { projectId: project.id, jobId: job.id },
      },
      {
        headers: await authHeadersFor(otherIdentity),
      },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "project_not_found", message: expect.any(String) });
  });

  it("returns 400 for an invalid create payload", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;

    const response = await client.api.project[":projectId"].jobs.$post(
      {
        param: { projectId: project.id },
        json: {
          type: "string",
          stringInput: {
            sourceText: "Hello world",
            sourceLocale: "en-US",
            targetLocales: [],
          },
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      error: "invalid_job_payload",
      message: expect.any(String),
    });
  });

  it("creates file jobs when the source file belongs to the project", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const sourceFile = await insertStoredSourceFile({
      projectId: project.id,
      filename: "source.xliff",
      contentType: "application/xliff+xml",
    });

    const response = await client.api.project[":projectId"].jobs.$post(
      {
        param: { projectId: project.id },
        json: {
          type: "file",
          fileInput: {
            sourceFileId: sourceFile.id,
            fileFormat: "xliff",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      job: {
        type: "file",
        status: "queued",
        inputPayload: {
          sourceFileId: sourceFile.id,
          fileFormat: "xliff",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      },
    });
  });

  it("rejects image file translation jobs until visual asset workers exist", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const sourceFile = await insertStoredSourceFile({
      projectId: project.id,
      filename: "banner.png",
      contentType: "image/png",
    });

    const response = await client.api.project[":projectId"].jobs.$post(
      {
        param: { projectId: project.id },
        json: {
          type: "file",
          fileInput: {
            sourceFileId: sourceFile.id,
            fileFormat: "png",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      error: "unsupported_source_file_format",
      message: expect.any(String),
    });
  });

  it("rejects file jobs when the source file is not in scope", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;

    const response = await client.api.project[":projectId"].jobs.$post(
      {
        param: { projectId: project.id },
        json: {
          type: "file",
          fileInput: {
            sourceFileId: "file_missing",
            fileFormat: "xliff",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      error: "source_file_not_found",
      message: expect.any(String),
    });
  });

  it("keeps the inserted job when queueing fails", async () => {
    const failingClient = testClient(
      createApp({
        jobQueue: {
          async enqueue() {
            throw new Error("queue down");
          },
        },
      }),
    );
    const identity = createWorkosIdentity();
    const projectResponse = await failingClient.api.project.$post(
      {
        json: {
          name: "Marketing Site",
          description: "Primary website strings",
          translationContext: "Use a concise product-marketing tone.",
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );
    const project = ((await projectResponse.json()) as ProjectResponse).project;

    const response = await failingClient.api.project[":projectId"].jobs.$post(
      {
        param: { projectId: project.id },
        json: {
          type: "string",
          stringInput: {
            sourceText: "Hello world",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(503);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      error: "job_queue_unavailable",
      message: expect.any(String),
    });

    const jobs = await db
      .select({
        id: schema.jobs.id,
        status: schema.jobs.status,
        lastError: schema.jobs.lastError,
      })
      .from(schema.jobs)
      .where(eq(schema.jobs.projectId, project.id));

    expect(jobs).toEqual([
      expect.objectContaining({
        status: "failed",
        lastError: "queue down",
      }),
    ]);
  });
});
