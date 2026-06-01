import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import type {
  JobQueue,
  ProviderAgentCommentQueue,
  ProviderAgentQaQueue,
  ProviderAgentTranslationQueue,
  ProviderAgentWritebackQueue,
  TranslationJobEventData,
} from "@/lib/workflow/types";
import { createProjectTestFixture } from "./project.fixture";
import type { JobRecord, WorkspaceJobRecord } from "./job.schema";
import type { ProjectResponse } from "./project.schema";
import {
  completeAgentRun,
  createAgentRun,
  startAgentRun,
} from "@/lib/providers/agent-runs/agent-runs";
import { serializeAgentRunProposalItem } from "@/lib/providers/agent-runs/agent-run-proposals";
import { upsertExternalJob } from "@/lib/providers/sync/organization-external-tms-jobs";

const { resolveApiAuthContextFromSessionMock, runProviderJobQaForJobMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  runProviderJobQaForJobMock: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/providers/agent-runs/provider-agent-qa", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/providers/agent-runs/provider-agent-qa")>();
  return {
    ...actual,
    runProviderJobQaForJob: (...args: unknown[]) => runProviderJobQaForJobMock(...args),
  };
});

function createInlineTestJobQueue(): JobQueue<TranslationJobEventData> {
  return {
    async enqueue(event) {
      return { ids: [event.jobId] };
    },
  };
}

function createInlineTestProviderAgentTranslationQueue(): ProviderAgentTranslationQueue {
  return {
    async enqueue(event) {
      return { ids: [event.agentRunId] };
    },
  };
}

function createInlineTestProviderAgentQaQueue(): ProviderAgentQaQueue {
  return {
    async enqueue(event) {
      return { ids: [event.agentRunId] };
    },
  };
}

function createInlineTestProviderAgentCommentQueue(): ProviderAgentCommentQueue {
  return {
    async enqueue(event) {
      return { ids: [event.agentRunId] };
    },
  };
}

function createInlineTestProviderAgentWritebackQueue(): ProviderAgentWritebackQueue {
  return {
    async enqueue(event) {
      return { ids: [event.agentRunId] };
    },
  };
}

const client = testClient(
  createApp({
    jobQueue: createInlineTestJobQueue(),
    providerAgentTranslationQueue: createInlineTestProviderAgentTranslationQueue(),
    providerAgentQaQueue: createInlineTestProviderAgentQaQueue(),
    providerAgentCommentQueue: createInlineTestProviderAgentCommentQueue(),
    providerAgentWritebackQueue: createInlineTestProviderAgentWritebackQueue(),
  }),
);
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
  projectId: string | null;
  filename?: string;
  contentType?: string;
  organizationId?: string;
}) {
  const [project] = params.projectId
    ? await db
        .select({ organizationId: schema.projects.organizationId })
        .from(schema.projects)
        .where(eq(schema.projects.id, params.projectId))
        .limit(1)
    : [];

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

    const nestedResponse = await appClient.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].jobs[":jobId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
          jobId: job.id,
        },
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

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].jobs.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
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

    const [usageEvent] = await db
      .select({
        operationKey: schema.usageEvents.operationKey,
        status: schema.usageEvents.status,
        featureId: schema.usageEvents.featureId,
        jobId: schema.usageEvents.jobId,
      })
      .from(schema.usageEvents)
      .where(eq(schema.usageEvents.jobId, body.job.id))
      .limit(1);

    expect(usageEvent).toEqual({
      operationKey: `job:${body.job.id}:translation_jobs`,
      status: "reserved",
      featureId: "translation_jobs",
      jobId: body.job.id,
    });
  });

  it("rejects job target locales outside the project scope", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity, {
      targetLocales: ["fr-FR"],
    });
    const project = ((await projectResponse.json()) as ProjectResponse).project;

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].jobs.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          type: "string",
          stringInput: {
            sourceText: "Hello world",
            sourceLocale: "en-US",
            targetLocales: ["ja-JP"],
          },
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "job_target_locale_not_in_project",
    });
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

    const allResponse = await client.api.orgs[":organizationSlug"].projects[":projectId"].jobs.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
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

    const mineResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].jobs.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
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

    const filteredResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].jobs.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        query: { type: "file", status: "failed", mine: "false", limit: "50" },
      },
      { headers: authHeader },
    );

    expect(filteredResponse.status).toBe(200);
    await expect(filteredResponse.json()).resolves.toEqual({
      jobs: [expect.objectContaining({ type: "file", status: "failed" })],
    });

    const limitedResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].jobs.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
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

    const projectJobsResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].jobs.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
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

    const getResponse = await client.api.orgs[":organizationSlug"].projects[":projectId"].jobs[
      ":jobId"
    ].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
          jobId: job.id,
        },
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

    const statusResponse = await client.api.orgs[":organizationSlug"].projects[":projectId"].jobs[
      ":jobId"
    ].status.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
          jobId: job.id,
        },
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
    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].jobs.$post(
      {
        param: {
          organizationSlug: ownerIdentity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
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
    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].jobs[
      ":jobId"
    ].$get(
      {
        param: {
          organizationSlug: ownerIdentity.organization.slug ?? "missing-slug",
          projectId: project.id,
          jobId: job.id,
        },
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

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].jobs.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
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

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].jobs.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
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

  it("creates project file jobs from workspace-uploaded source files", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const sourceFile = await insertStoredSourceFile({
      organizationId: project.organizationId,
      projectId: null,
      filename: "workspace-source.xliff",
      contentType: "application/xliff+xml",
    });

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].jobs.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
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

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].jobs.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
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

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].jobs.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
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
    const projectResponse = await failingClient.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: {
          name: "Marketing Site",
          description: "Primary website strings",
          translationContext: "Use a concise product-marketing tone.",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR", "de-DE"],
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );
    const project = ((await projectResponse.json()) as ProjectResponse).project;

    const response = await failingClient.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].jobs.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
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

  it("returns provider metadata and actions for provider-backed workspace jobs", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.projects)
      .innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id))
      .where(eq(schema.projects.id, project.id))
      .limit(1);

    const externalJob = await upsertExternalJob({
      organizationId: organization!.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-detail-1",
      externalTaskId: "crowdin-task-1",
      externalStatus: "in_progress",
      title: "Homepage strings",
      targetLocales: ["fr-FR"],
      assignedUsers: ["translator@example.com"],
      externalUrl: "https://crowdin.com/project/demo/tasks/1",
      providerPayload: { fileIds: [101] },
    });

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
        },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      job: expect.objectContaining({
        id: externalJob.id,
        externalProviderKind: "crowdin",
        externalTitle: "Homepage strings",
        externalStatus: "in_progress",
        providerActions: expect.arrayContaining([
          expect.objectContaining({
            id: "translate_with_agent",
            visible: true,
            enabled: true,
          }),
        ]),
        providerSourceFiles: [
          expect.objectContaining({
            id: "101",
            displayName: "101",
          }),
        ],
      }),
    });
  });

  it("runs synchronous QA checks for provider-backed jobs", async () => {
    runProviderJobQaForJobMock.mockResolvedValue({
      pullRunId: "pull-run-manual-qa",
      report: {
        findings: [
          {
            checkType: "placeholder_mismatch",
            severity: "error",
            message: "Target is missing placeholder {name}",
            suggestedFix: "Add {name} to the French translation",
            item: {
              externalStringId: "1",
              key: "hello",
              locale: "fr",
              field: "target",
            },
          },
        ],
        summary: {
          total: 1,
          byCheckType: { placeholder_mismatch: 1 },
          bySeverity: { error: 1 },
        },
      },
      unitsDiscovered: 1,
    });

    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.projects)
      .innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id))
      .where(eq(schema.projects.id, project.id))
      .limit(1);

    const externalJob = await upsertExternalJob({
      organizationId: organization!.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-manual-qa",
      externalStatus: "todo",
      title: "Manual QA copy",
    });

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"].qa.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
        },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      qaReport: {
        pullRunId: "pull-run-manual-qa",
        findings: [
          expect.objectContaining({
            checkType: "placeholder_mismatch",
            severity: "error",
            item: expect.objectContaining({ key: "hello" }),
          }),
        ],
        summary: expect.objectContaining({ total: 1 }),
      },
    });
    expect(runProviderJobQaForJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: organization!.id,
        projectId: project.id,
        providerKind: "crowdin",
        externalJobId: "crowdin-job-manual-qa",
      }),
    );
  });

  it("returns 500 when synchronous QA fails due to sandbox execution", async () => {
    runProviderJobQaForJobMock.mockRejectedValue(new Error("hl check failed (exit 1): boom"));

    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.projects)
      .innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id))
      .where(eq(schema.projects.id, project.id))
      .limit(1);

    const externalJob = await upsertExternalJob({
      organizationId: organization!.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-manual-qa-failure",
      externalStatus: "todo",
      title: "Manual QA failure",
    });

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"].qa.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
        },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "provider_qa_failed",
      message: "hl check failed (exit 1): boom",
    });
  });

  it("returns 503 when synchronous QA fails due to transient provider errors", async () => {
    runProviderJobQaForJobMock.mockRejectedValue(
      new Error("Phrase returned HTTP 429 while listing files"),
    );

    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.projects)
      .innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id))
      .where(eq(schema.projects.id, project.id))
      .limit(1);

    const externalJob = await upsertExternalJob({
      organizationId: organization!.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-manual-qa-unavailable",
      externalStatus: "todo",
      title: "Manual QA unavailable",
    });

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"].qa.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
        },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "provider_qa_unavailable",
      message: "Phrase returned HTTP 429 while listing files",
    });
  });

  it("creates agent runs for supported provider actions", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.projects)
      .innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id))
      .where(eq(schema.projects.id, project.id))
      .limit(1);

    const externalJob = await upsertExternalJob({
      organizationId: organization!.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-detail-2",
      externalStatus: "todo",
      title: "Product copy",
    });

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"]["agent-runs"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
        },
        json: { action: "translate_with_agent" },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      agentRun: { kind: string; status: string; externalJobId: string };
    };
    expect(body.agentRun).toMatchObject({
      kind: "translate",
      status: "queued",
      externalJobId: "crowdin-job-detail-2",
    });

    const listResponse = await client.api.orgs[":organizationSlug"].jobs[":jobId"][
      "agent-runs"
    ].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
        },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      agentRuns: [expect.objectContaining({ kind: "translate", status: "queued" })],
    });
  });

  it("creates review agent runs for QA actions", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.projects)
      .innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id))
      .where(eq(schema.projects.id, project.id))
      .limit(1);

    const externalJob = await upsertExternalJob({
      organizationId: organization!.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-qa-agent",
      externalStatus: "todo",
      title: "QA copy",
    });

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"]["agent-runs"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
        },
        json: { action: "run_qa_checks" },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      agentRun: { kind: string; status: string; externalJobId: string };
    };
    expect(body.agentRun).toMatchObject({
      kind: "review",
      status: "queued",
      externalJobId: "crowdin-job-qa-agent",
    });
  });

  it("creates review agent runs for review_with_agent", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.projects)
      .innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id))
      .where(eq(schema.projects.id, project.id))
      .limit(1);

    const externalJob = await upsertExternalJob({
      organizationId: organization!.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-review-agent",
      externalStatus: "todo",
      title: "Review copy",
    });

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"]["agent-runs"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
        },
        json: { action: "review_with_agent" },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      agentRun: {
        kind: string;
        status: string;
        externalJobId: string;
        inputSnapshot: Record<string, unknown>;
      };
    };
    expect(body.agentRun).toMatchObject({
      kind: "review",
      status: "queued",
      externalJobId: "crowdin-job-review-agent",
      inputSnapshot: expect.objectContaining({ action: "review_with_agent" }),
    });
  });

  it("marks the agent run failed when provider translation queueing fails", async () => {
    const failingClient = testClient(
      createApp({
        jobQueue: createInlineTestJobQueue(),
        providerAgentTranslationQueue: {
          async enqueue() {
            throw new Error("agent queue down");
          },
        },
        providerAgentQaQueue: createInlineTestProviderAgentQaQueue(),
      }),
    );
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.projects)
      .innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id))
      .where(eq(schema.projects.id, project.id))
      .limit(1);

    const externalJob = await upsertExternalJob({
      organizationId: organization!.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-queue-fail",
      externalStatus: "todo",
      title: "Queue failure copy",
    });

    const response = await failingClient.api.orgs[":organizationSlug"].jobs[":jobId"][
      "agent-runs"
    ].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
        },
        json: { action: "translate_with_agent" },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "agent_run_queue_unavailable",
      message: expect.any(String),
    });

    const agentRuns = await db
      .select({
        status: schema.agentRuns.status,
        outputSummary: schema.agentRuns.outputSummary,
        warnings: schema.agentRuns.warnings,
      })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.hyperlocaliseJobId, externalJob.id));

    expect(agentRuns).toEqual([
      expect.objectContaining({
        status: "failed",
        outputSummary: { code: "agent_run_queue_unavailable" },
        warnings: ["agent queue down"],
      }),
    ]);
  });

  it("marks the agent run failed when provider QA queueing fails", async () => {
    const failingClient = testClient(
      createApp({
        jobQueue: createInlineTestJobQueue(),
        providerAgentTranslationQueue: createInlineTestProviderAgentTranslationQueue(),
        providerAgentQaQueue: {
          async enqueue() {
            throw new Error("qa queue down");
          },
        },
      }),
    );
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.projects)
      .innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id))
      .where(eq(schema.projects.id, project.id))
      .limit(1);

    const externalJob = await upsertExternalJob({
      organizationId: organization!.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-qa-queue-fail",
      externalStatus: "todo",
      title: "QA queue failure copy",
    });

    const response = await failingClient.api.orgs[":organizationSlug"].jobs[":jobId"][
      "agent-runs"
    ].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
        },
        json: { action: "run_qa_checks" },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "agent_run_queue_unavailable",
      message: expect.any(String),
    });

    const agentRuns = await db
      .select({
        status: schema.agentRuns.status,
        outputSummary: schema.agentRuns.outputSummary,
        warnings: schema.agentRuns.warnings,
      })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.hyperlocaliseJobId, externalJob.id));

    expect(agentRuns).toEqual([
      expect.objectContaining({
        status: "failed",
        outputSummary: { code: "agent_run_queue_unavailable" },
        warnings: ["qa queue down"],
      }),
    ]);
  });

  it("creates comment_only agent runs for leave_provider_comment", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.projects)
      .innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id))
      .where(eq(schema.projects.id, project.id))
      .limit(1);

    const externalJob = await upsertExternalJob({
      organizationId: organization!.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-comment-agent",
      externalStatus: "todo",
      title: "Comment write-back copy",
    });

    const selectedFindings = [
      {
        checkType: "glossary_violation" as const,
        severity: "warning" as const,
        message: "Use approved term",
        item: {
          externalStringId: "hash-1",
          key: "cta.label",
          locale: "fr-FR",
          field: "target" as const,
        },
      },
    ];

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"]["agent-runs"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
        },
        json: {
          action: "leave_provider_comment",
          selectedFindings,
        },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      agentRun: {
        kind: string;
        status: string;
        inputSnapshot: Record<string, unknown>;
      };
    };
    expect(body.agentRun).toMatchObject({
      kind: "comment_only",
      status: "queued",
      inputSnapshot: expect.objectContaining({
        action: "leave_provider_comment",
        selectedFindings,
      }),
    });
  });

  it("creates translate agent runs for push_approved_changes", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.projects)
      .innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id))
      .where(eq(schema.projects.id, project.id))
      .limit(1);

    const externalJob = await upsertExternalJob({
      organizationId: organization!.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-writeback-agent",
      externalStatus: "todo",
      title: "Write-back copy",
    });

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"]["agent-runs"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
        },
        json: {
          action: "push_approved_changes",
        },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      agentRun: {
        kind: string;
        status: string;
        inputSnapshot: Record<string, unknown>;
      };
    };
    expect(body.agentRun).toMatchObject({
      kind: "translate",
      status: "queued",
      inputSnapshot: expect.objectContaining({
        action: "push_approved_changes",
      }),
    });
  });

  it("marks the agent run failed when provider write-back queueing fails", async () => {
    const failingClient = testClient(
      createApp({
        jobQueue: createInlineTestJobQueue(),
        providerAgentTranslationQueue: createInlineTestProviderAgentTranslationQueue(),
        providerAgentQaQueue: createInlineTestProviderAgentQaQueue(),
        providerAgentCommentQueue: createInlineTestProviderAgentCommentQueue(),
        providerAgentWritebackQueue: {
          async enqueue() {
            throw new Error("write-back queue down");
          },
        },
      }),
    );
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.projects)
      .innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id))
      .where(eq(schema.projects.id, project.id))
      .limit(1);

    const externalJob = await upsertExternalJob({
      organizationId: organization!.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-writeback-queue-fail",
      externalStatus: "todo",
      title: "Write-back queue failure copy",
    });

    const response = await failingClient.api.orgs[":organizationSlug"].jobs[":jobId"][
      "agent-runs"
    ].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
        },
        json: {
          action: "push_approved_changes",
        },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "agent_run_queue_unavailable",
      message: expect.any(String),
    });

    const agentRuns = await db
      .select({
        status: schema.agentRuns.status,
        outputSummary: schema.agentRuns.outputSummary,
        warnings: schema.agentRuns.warnings,
      })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.hyperlocaliseJobId, externalJob.id));

    expect(agentRuns).toEqual([
      expect.objectContaining({
        status: "failed",
        outputSummary: { code: "agent_run_queue_unavailable" },
        warnings: ["write-back queue down"],
      }),
    ]);
  });

  it("marks the agent run failed when provider comment queueing fails", async () => {
    const failingClient = testClient(
      createApp({
        jobQueue: createInlineTestJobQueue(),
        providerAgentTranslationQueue: createInlineTestProviderAgentTranslationQueue(),
        providerAgentQaQueue: createInlineTestProviderAgentQaQueue(),
        providerAgentCommentQueue: {
          async enqueue() {
            throw new Error("comment queue down");
          },
        },
        providerAgentWritebackQueue: createInlineTestProviderAgentWritebackQueue(),
      }),
    );
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.projects)
      .innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id))
      .where(eq(schema.projects.id, project.id))
      .limit(1);

    const externalJob = await upsertExternalJob({
      organizationId: organization!.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-comment-queue-fail",
      externalStatus: "todo",
      title: "Comment queue failure copy",
    });

    const response = await failingClient.api.orgs[":organizationSlug"].jobs[":jobId"][
      "agent-runs"
    ].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
        },
        json: {
          action: "leave_provider_comment",
          selectedFindings: [
            {
              checkType: "glossary_violation",
              severity: "warning",
              message: "Use approved term",
              item: {
                externalStringId: "hash-1",
                key: "cta.label",
                locale: "fr-FR",
                field: "target",
              },
            },
          ],
        },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "agent_run_queue_unavailable",
      message: expect.any(String),
    });

    const agentRuns = await db
      .select({
        status: schema.agentRuns.status,
        outputSummary: schema.agentRuns.outputSummary,
        warnings: schema.agentRuns.warnings,
      })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.hyperlocaliseJobId, externalJob.id));

    expect(agentRuns).toEqual([
      expect.objectContaining({
        status: "failed",
        outputSummary: { code: "agent_run_queue_unavailable" },
        warnings: ["comment queue down"],
      }),
    ]);
  });

  it("rejects agent runs for native jobs", async () => {
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
        sourceText: "Hello",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    });

    const response = await client.api.orgs[":organizationSlug"].jobs[":jobId"]["agent-runs"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: job.id,
        },
        json: { action: "translate_with_agent" },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "provider_job_required",
    });
  });

  it("persists accept and reject decisions for agent run proposals", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.projects)
      .innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id))
      .where(eq(schema.projects.id, project.id))
      .limit(1);

    const externalJob = await upsertExternalJob({
      organizationId: organization!.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-review-1",
      externalStatus: "todo",
      title: "Review copy",
    });

    const agentRun = await createAgentRun({
      organizationId: organization!.id,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-review-1",
      kind: "translate",
      hyperlocaliseJobId: externalJob.id,
      inputSnapshot: { action: "translate_with_agent", projectId: project.id },
    });

    await startAgentRun({
      runId: agentRun.id,
      organizationId: organization!.id,
    });

    await completeAgentRun({
      runId: agentRun.id,
      organizationId: organization!.id,
      outputSummary: { proposedCount: 2 },
      changedItems: [
        serializeAgentRunProposalItem({
          itemId: "1:fr",
          externalStringId: "1",
          key: "hello",
          locale: "fr",
          sourceText: "Hello {name}",
          from: "",
          to: "Bonjour",
          reviewState: "pending",
          changedFields: ["target"],
          warnings: { placeholder: true },
        }),
        serializeAgentRunProposalItem({
          itemId: "2:fr",
          externalStringId: "2",
          key: "world",
          locale: "fr",
          sourceText: "World",
          from: "Monde",
          to: "Le monde",
          reviewState: "pending",
          changedFields: ["target"],
          warnings: {},
        }),
      ],
    });

    const acceptResponse = await client.api.orgs[":organizationSlug"].jobs[":jobId"]["agent-runs"][
      ":agentRunId"
    ].review.$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
          agentRunId: agentRun.id,
        },
        json: {
          updates: [{ itemId: "1:fr", reviewState: "accepted" }],
        },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(acceptResponse.status).toBe(200);
    const acceptBody = (await acceptResponse.json()) as {
      agentRun: { changedItems: Array<{ itemId: string; reviewState: string }> };
    };
    expect(acceptBody.agentRun.changedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: "1:fr", reviewState: "accepted" }),
        expect.objectContaining({ itemId: "2:fr", reviewState: "pending" }),
      ]),
    );

    const emptyFilteredResponse = await client.api.orgs[":organizationSlug"].jobs[":jobId"][
      "agent-runs"
    ][":agentRunId"].review.$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
          agentRunId: agentRun.id,
        },
        json: {
          bulk: { reviewState: "accepted", scope: "filtered" },
        },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(emptyFilteredResponse.status).toBe(200);
    const emptyFilteredBody = (await emptyFilteredResponse.json()) as {
      agentRun: { changedItems: Array<{ itemId: string; reviewState: string }> };
    };
    expect(emptyFilteredBody.agentRun.changedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: "1:fr", reviewState: "accepted" }),
        expect.objectContaining({ itemId: "2:fr", reviewState: "pending" }),
      ]),
    );

    const rejectResponse = await client.api.orgs[":organizationSlug"].jobs[":jobId"]["agent-runs"][
      ":agentRunId"
    ].review.$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          jobId: externalJob.id,
          agentRunId: agentRun.id,
        },
        json: {
          bulk: { reviewState: "rejected", scope: "pending" },
        },
      },
      { headers: await authHeadersFor(identity) },
    );

    expect(rejectResponse.status).toBe(200);
    const rejectBody = (await rejectResponse.json()) as {
      agentRun: { changedItems: Array<{ itemId: string; reviewState: string }> };
    };
    expect(rejectBody.agentRun.changedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: "1:fr", reviewState: "accepted" }),
        expect.objectContaining({ itemId: "2:fr", reviewState: "rejected" }),
      ]),
    );
  });
});
