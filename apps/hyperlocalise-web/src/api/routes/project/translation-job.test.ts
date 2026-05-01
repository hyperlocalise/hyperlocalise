import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import type { TranslationJobQueue } from "@/lib/workflow/types";
import { createProjectTestFixture } from "./project.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(() => globalThis.__testApiAuthContext ?? null),
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

function createInlineTestTranslationJobQueue(): TranslationJobQueue {
  return {
    async enqueue(event) {
      return { ids: [event.jobId] };
    },
  };
}

const client = testClient(
  createApp({
    translationJobQueue: createInlineTestTranslationJobQueue(),
  }),
);
const projectFixture = createProjectTestFixture(client);
const {
  authHeadersFor,
  cleanup,
  createProjectViaApi,
  createWorkosIdentity,
  createWorkosIdentityForOrganization,
  getLocalUserId,
} = projectFixture;

type ProjectResponse = {
  project: {
    id: string;
  };
};

type TranslationJobRecord = {
  id: string;
  projectId: string;
  createdByUserId: string | null;
  type: "string" | "file";
  status: "queued" | "running" | "succeeded" | "failed";
  inputPayload: Record<string, unknown>;
  outcomeKind: string | null;
  outcomePayload: Record<string, unknown> | null;
  lastError: string | null;
  workflowRunId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

async function insertTranslationJob(params: {
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
  const [job] = await db
    .insert(schema.translationJobs)
    .values({
      id: `job_${randomUUID()}`,
      projectId: params.projectId,
      createdByUserId: params.createdByUserId,
      type: params.type,
      status: params.status,
      inputPayload: params.inputPayload,
      outcomeKind: params.outcomeKind ?? null,
      outcomePayload: params.outcomePayload ?? null,
      lastError: params.lastError ?? null,
      workflowRunId: params.workflowRunId ?? null,
      completedAt: params.status === "succeeded" || params.status === "failed" ? new Date() : null,
    })
    .returning();

  return job;
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanup();
});

describe("translationJobRoutes", () => {
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

    const body = (await response.json()) as { job: TranslationJobRecord };
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

    await insertTranslationJob({
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

    await insertTranslationJob({
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

    await insertTranslationJob({
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
    const mineBody = (await mineResponse.json()) as { jobs: TranslationJobRecord[] };
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

  it("returns a full job record and a lightweight status view", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const localUserId = await getLocalUserId(identity.user.workosUserId);

    const job = await insertTranslationJob({
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
    await expect(response.json()).resolves.toEqual({
      error: "forbidden",
    });
  });

  it("returns 404 when another organization fetches a job", async () => {
    const ownerIdentity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(ownerIdentity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;
    const localUserId = await getLocalUserId(ownerIdentity.user.workosUserId);

    const job = await insertTranslationJob({
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
    await expect(response.json()).resolves.toEqual({
      error: "project_not_found",
    });
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
    await expect(response.json()).resolves.toEqual({
      error: "invalid_translation_job_payload",
    });
  });

  it("rejects file jobs until file execution is implemented", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as ProjectResponse).project;

    const response = await client.api.project[":projectId"].jobs.$post(
      {
        param: { projectId: project.id },
        json: {
          type: "file",
          fileInput: {
            sourceFileId: "file_123",
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

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({
      error: "file_translation_jobs_not_supported",
    });
  });

  it("keeps the inserted job when queueing fails", async () => {
    const failingClient = testClient(
      createApp({
        translationJobQueue: {
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
    await expect(response.json()).resolves.toEqual({
      error: "translation_job_queue_unavailable",
    });

    const jobs = await db
      .select({
        id: schema.translationJobs.id,
        status: schema.translationJobs.status,
        lastError: schema.translationJobs.lastError,
      })
      .from(schema.translationJobs)
      .where(eq(schema.translationJobs.projectId, project.id));

    expect(jobs).toEqual([
      expect.objectContaining({
        status: "failed",
        lastError: "queue down",
      }),
    ]);
  });
});
