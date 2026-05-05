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

function createInlineTestJobQueue(): TranslationJobQueue {
  return {
    async enqueue(event) {
      return { ids: [event.jobId] };
    },
  };
}

const client = testClient(
  createApp({
    jobQueue: createInlineTestJobQueue(),
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

type JobRecord = {
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

async function ensureStoredFilesTestSchema() {
  await db.$client.query(`
    DO $$
    BEGIN
      CREATE TYPE stored_file_role AS ENUM ('source', 'output', 'reference', 'asset');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  await db.$client.query(`
    DO $$
    BEGIN
      CREATE TYPE stored_file_source_kind AS ENUM (
        'chat_upload',
        'email_attachment',
        'job_output',
        'repository_file',
        'tms_file'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  await db.$client.query(`
    CREATE TABLE IF NOT EXISTS stored_files (
      id text PRIMARY KEY NOT NULL,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
      project_id text REFERENCES projects(id) ON DELETE set null,
      created_by_user_id uuid REFERENCES users(id) ON DELETE set null,
      role stored_file_role NOT NULL,
      source_kind stored_file_source_kind NOT NULL,
      source_interaction_id uuid REFERENCES interactions(id) ON DELETE set null,
      source_job_id text REFERENCES jobs(id) ON DELETE set null,
      storage_provider text NOT NULL,
      storage_key text NOT NULL,
      storage_url text NOT NULL,
      download_url text,
      filename text NOT NULL,
      content_type text NOT NULL,
      byte_size integer NOT NULL,
      sha256 text NOT NULL,
      etag text,
      metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
}

beforeAll(async () => {
  await db.$client.query("select 1");
  await ensureStoredFilesTestSchema();
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanup();
});

describe("jobRoutes", () => {
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
    const body = (await response.json()) as { jobs: Array<JobRecord & { projectName: string }> };
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]?.createdByUserId).toBe(localUserId);
    expect(body.jobs[0]?.projectName).toEqual(expect.any(String));
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
      error: "invalid_job_payload",
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
    await expect(response.json()).resolves.toEqual({
      error: "source_file_not_found",
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
    await expect(response.json()).resolves.toEqual({
      error: "job_queue_unavailable",
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
