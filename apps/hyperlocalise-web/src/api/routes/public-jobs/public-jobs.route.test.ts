/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { ensureAiFeaturesAllowedMock, enqueueJobCreatedActivityMock } = vi.hoisted(() => ({
  ensureAiFeaturesAllowedMock: vi.fn(),
  enqueueJobCreatedActivityMock: vi.fn(),
}));

vi.mock("@/lib/billing/ai-features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/ai-features")>();
  return {
    ...actual,
    ensureAiFeaturesAllowed: ensureAiFeaturesAllowedMock,
  };
});

vi.mock("@/lib/activity-log/job-automation-events", () => ({
  enqueueJobCreatedActivity: enqueueJobCreatedActivityMock,
  enqueueJobFailedActivity: vi.fn(),
}));

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { err, ok } from "@/lib/primitives/result/results";
import {
  AI_CREDIT_EXHAUSTED_CODE,
  AI_CREDIT_EXHAUSTED_MESSAGE,
  AI_FEATURES_REQUIRED_CODE,
  AI_FEATURES_REQUIRED_MESSAGE,
} from "@/lib/billing/ai-features";
import type { TranslationJobEventData } from "@/lib/workflow/types";

import {
  createPublicApiFixture,
  insertStoredSourceFile,
  cleanupPublicApiFixture,
} from "./public-jobs.fixture";

const enqueueJob = vi.fn(async (event: TranslationJobEventData) => ({
  ids: [event.jobId],
}));

const client = testClient<AppType>(
  createApp({
    jobQueue: {
      enqueue: enqueueJob,
    },
  }),
);

beforeAll(async () => {
  await db.$client.query("select 1");
  ensureAiFeaturesAllowedMock.mockResolvedValue(ok(undefined));
});

afterEach(async () => {
  vi.clearAllMocks();
  ensureAiFeaturesAllowedMock.mockResolvedValue(ok(undefined));
  await cleanupPublicApiFixture();
});

describe("publicJobRoutes", () => {
  it("rejects job creation when AI features are not allowed", async () => {
    ensureAiFeaturesAllowedMock.mockResolvedValue(
      err({
        code: AI_FEATURES_REQUIRED_CODE,
        message: AI_FEATURES_REQUIRED_MESSAGE,
      }),
    );
    const { apiKey, project } = await createPublicApiFixture();

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: project.id,
          stringInput: {
            sourceText: "Hello world",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: AI_FEATURES_REQUIRED_CODE,
      message: AI_FEATURES_REQUIRED_MESSAGE,
    });
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(ensureAiFeaturesAllowedMock).toHaveBeenCalledWith({
      organizationId: project.organizationId,
    });
  });
  it("rejects job creation with 402 when the AI credit is used up", async () => {
    ensureAiFeaturesAllowedMock.mockResolvedValue(
      err({
        code: AI_CREDIT_EXHAUSTED_CODE,
        message: AI_CREDIT_EXHAUSTED_MESSAGE,
      }),
    );
    const { apiKey, project } = await createPublicApiFixture();

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: project.id,
          stringInput: {
            sourceText: "Hello world",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      error: AI_CREDIT_EXHAUSTED_CODE,
      message: AI_CREDIT_EXHAUSTED_MESSAGE,
    });
    expect(enqueueJob).not.toHaveBeenCalled();
  });
  it("creates a string job for a double-encoded external project id", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const projectId = `ext:crowdin:${project.id}`;
    const encodedProjectId = encodeURIComponent(encodeURIComponent(projectId));
    await db
      .update(schema.projects)
      .set({ id: projectId })
      .where(eq(schema.projects.id, project.id));

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: encodedProjectId,
          stringInput: {
            sourceText: "Hello world",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { job: { id: string } };
    const [job] = await db
      .select({ projectId: schema.jobs.projectId })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, body.job.id))
      .limit(1);
    expect(job?.projectId).toBe(projectId);
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
      }),
    );
  });

  it("creates and enqueues a string translation job with an API key", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: project.id,
          stringInput: {
            sourceText: "Hello world",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { job: { id: string; status: string; type: string } };
    expect(body.job).toEqual({
      id: expect.stringMatching(/^job_/),
      status: "queued",
      type: "string",
    });
    expect(enqueueJob).toHaveBeenCalledWith({
      kind: "translation",
      jobId: body.job.id,
      projectId: project.id,
      type: "string",
    });
    expect(enqueueJobCreatedActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorCredentialId: expect.any(String),
        actorKind: "api_key",
        jobId: body.job.id,
        organizationId: project.organizationId,
        projectId: project.id,
        status: "queued",
      }),
    );

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

  it("creates and enqueues a file translation job with an API key", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const sourceFile = await insertStoredSourceFile({
      organizationId: project.organizationId,
      projectId: project.id,
      filename: "source.xliff",
      contentType: "application/xliff+xml",
    });

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "file",
          projectId: project.id,
          fileInput: {
            sourceFileId: sourceFile.id,
            fileFormat: "xliff",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
            metadata: {
              instructions: "Keep product names unchanged.",
            },
          },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { job: { id: string; status: string; type: string } };
    expect(body.job).toEqual({
      id: expect.stringMatching(/^job_/),
      status: "queued",
      type: "file",
    });
    expect(enqueueJob).toHaveBeenCalledWith({
      kind: "translation",
      jobId: body.job.id,
      projectId: project.id,
      type: "file",
    });
  });

  it("associates repository file jobs with the source file version", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const sourceFile = await insertStoredSourceFile({
      organizationId: project.organizationId,
      projectId: project.id,
      filename: "source.xliff",
      contentType: "application/xliff+xml",
      sourceKind: "repository_file",
      metadata: {
        sourcePath: "locales/en/source.xliff",
        sourceHash: "sha256:legacy",
        commitSha: "abc123",
        workflowRunId: "run_legacy",
        uploadSurface: "public_api",
      },
    });

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "file",
          projectId: project.id,
          fileInput: {
            sourceFileId: sourceFile.id,
            fileFormat: "xliff",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { job: { id: string } };
    const [details] = await db
      .select({
        sourceFileVersionId: schema.translationJobDetails.sourceFileVersionId,
      })
      .from(schema.translationJobDetails)
      .where(eq(schema.translationJobDetails.jobId, body.job.id));
    expect(details?.sourceFileVersionId).toEqual(expect.any(String));

    const [version] = await db
      .select()
      .from(schema.repositorySourceFileVersions)
      .where(eq(schema.repositorySourceFileVersions.id, details?.sourceFileVersionId ?? ""));
    expect(version).toMatchObject({
      storedFileId: sourceFile.id,
      sourcePath: "locales/en/source.xliff",
      sourceHash: "sha256:legacy",
      commitSha: "abc123",
      workflowRunId: "run_legacy",
    });
  });

  it("rejects public file jobs when the source file is not in scope", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "file",
          projectId: project.id,
          fileInput: {
            sourceFileId: "file_missing",
            fileFormat: "xliff",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      error: "source_file_not_found",
      message: expect.any(String),
    });
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});

describe("publicJobRoutes job fields and idempotency", () => {
  const stringJob = (projectId: string, overrides: Record<string, unknown> = {}) => ({
    type: "string" as const,
    projectId,
    stringInput: {
      sourceText: "Hello world",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    },
    ...overrides,
  });

  async function jobRow(jobId: string) {
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).limit(1);
    return job;
  }

  it("stores the title, description, due date and owner a client sets", async () => {
    const { apiKey, project, user } = await createPublicApiFixture();

    const response = await client.api.v1.jobs.$post(
      {
        json: stringJob(project.id, {
          title: " Spring campaign ",
          description: "Landing page",
          dueAt: "2026-11-15T17:00:00+10:00",
          ownerEmail: user.email.toUpperCase(),
        }),
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { job: { id: string } };
    const job = await jobRow(body.job.id);
    expect(job?.ownerUserId).toBe(user.id);
    expect(job?.assigneeType).toBe("user");
    expect(job?.dueAt?.toISOString()).toBe("2026-11-15T07:00:00.000Z");
    expect(job?.inputPayload).toMatchObject({
      metadata: { title: "Spring campaign", description: "Landing page" },
    });
  });

  it("rejects an owner who is not a workspace member", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    const response = await client.api.v1.jobs.$post(
      { json: stringJob(project.id, { ownerEmail: "nobody@example.com" }) },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "owner_not_found" });
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("rejects a due date without a time zone", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    const response = await client.api.v1.jobs.$post(
      { json: stringJob(project.id, { dueAt: "2026-11-15" }) },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_job_payload" });
  });

  it("returns the first job when a request is retried with the same Idempotency-Key", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const headers = { "x-api-key": apiKey, "idempotency-key": "order-42" };

    const first = await client.api.v1.jobs.$post({ json: stringJob(project.id) }, { headers });
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { job: { id: string } };

    const retry = await client.api.v1.jobs.$post({ json: stringJob(project.id) }, { headers });
    expect(retry.status).toBe(200);
    expect(retry.headers.get("idempotent-replayed")).toBe("true");
    await expect(retry.json()).resolves.toEqual({
      job: { id: firstBody.job.id, type: "string", status: "queued" },
    });

    const jobs = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.projectId, project.id));
    expect(jobs).toHaveLength(1);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  it("creates one job when the same key arrives twice at once", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const headers = { "x-api-key": apiKey, "idempotency-key": "order-43" };

    const responses = await Promise.all([
      client.api.v1.jobs.$post({ json: stringJob(project.id) }, { headers }),
      client.api.v1.jobs.$post({ json: stringJob(project.id) }, { headers }),
    ]);

    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 201]);
    const ids = await Promise.all(
      responses.map(
        async (response) => ((await response.json()) as { job: { id: string } }).job.id,
      ),
    );
    expect(ids[0]).toBe(ids[1]);
    const jobs = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.projectId, project.id));
    expect(jobs).toHaveLength(1);
  });

  it("refuses a reused Idempotency-Key with a different body", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const headers = { "x-api-key": apiKey, "idempotency-key": "order-44" };

    const first = await client.api.v1.jobs.$post({ json: stringJob(project.id) }, { headers });
    expect(first.status).toBe(201);

    const changed = await client.api.v1.jobs.$post(
      { json: stringJob(project.id, { title: "Different" }) },
      { headers },
    );
    expect(changed.status).toBe(422);
    await expect(changed.json()).resolves.toMatchObject({ error: "idempotency_key_reused" });
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  it("rejects an Idempotency-Key that is not printable ASCII", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    for (const key of ["has space", "x".repeat(256)]) {
      const response = await client.api.v1.jobs.$post(
        { json: stringJob(project.id) },
        { headers: { "x-api-key": apiKey, "idempotency-key": key } },
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "invalid_idempotency_key" });
    }
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("replays when owner email case, dueAt form, or metadata key order change", async () => {
    const { apiKey, project, user } = await createPublicApiFixture();
    const headers = { "x-api-key": apiKey, "idempotency-key": "order-45" };

    const first = await client.api.v1.jobs.$post(
      {
        json: stringJob(project.id, {
          ownerEmail: user.email,
          dueAt: "2026-11-15T17:00:00Z",
          stringInput: {
            sourceText: "Hello world",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
            metadata: { instructions: "Keep names", tone: "formal" },
          },
        }),
      },
      { headers },
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { job: { id: string } };

    const retry = await client.api.v1.jobs.$post(
      {
        json: stringJob(project.id, {
          ownerEmail: user.email.toUpperCase(),
          dueAt: "2026-11-15T17:00:00+00:00",
          stringInput: {
            sourceText: "Hello world",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
            metadata: { tone: "formal", instructions: "Keep names" },
          },
        }),
      },
      { headers },
    );
    expect(retry.status).toBe(200);
    expect(retry.headers.get("idempotent-replayed")).toBe("true");
    await expect(retry.json()).resolves.toEqual({
      job: { id: firstBody.job.id, type: "string", status: "queued" },
    });
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  it("re-enqueues the first job when a retry follows a queue failure", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const headers = { "x-api-key": apiKey, "idempotency-key": "order-46" };
    enqueueJob.mockRejectedValueOnce(new Error("queue down"));

    const first = await client.api.v1.jobs.$post({ json: stringJob(project.id) }, { headers });
    expect(first.status).toBe(503);
    await expect(first.json()).resolves.toMatchObject({ error: "job_queue_unavailable" });
    const [failed] = await db
      .select({ id: schema.jobs.id, status: schema.jobs.status })
      .from(schema.jobs)
      .where(eq(schema.jobs.projectId, project.id));
    expect(failed?.status).toBe("failed");

    const retry = await client.api.v1.jobs.$post({ json: stringJob(project.id) }, { headers });
    expect(retry.status).toBe(200);
    expect(retry.headers.get("idempotent-replayed")).toBe("true");
    await expect(retry.json()).resolves.toEqual({
      job: { id: failed?.id, type: "string", status: "queued" },
    });
    const recovered = await jobRow(failed?.id ?? "");
    expect(recovered?.status).toBe("queued");
    expect(recovered?.lastError).toBeNull();
    expect(enqueueJob).toHaveBeenCalledTimes(2);
  });

  it("returns 503 again when the retry still cannot enqueue", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const headers = { "x-api-key": apiKey, "idempotency-key": "order-47" };
    enqueueJob.mockRejectedValueOnce(new Error("queue down"));
    enqueueJob.mockRejectedValueOnce(new Error("queue down"));

    const first = await client.api.v1.jobs.$post({ json: stringJob(project.id) }, { headers });
    expect(first.status).toBe(503);

    const retry = await client.api.v1.jobs.$post({ json: stringJob(project.id) }, { headers });
    expect(retry.status).toBe(503);
    await expect(retry.json()).resolves.toMatchObject({ error: "job_queue_unavailable" });
    expect(retry.headers.get("idempotent-replayed")).toBeNull();
    expect(enqueueJob).toHaveBeenCalledTimes(2);
  });

  it("does not re-enqueue a job that failed after it started", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const headers = { "x-api-key": apiKey, "idempotency-key": "order-48" };

    const first = await client.api.v1.jobs.$post({ json: stringJob(project.id) }, { headers });
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { job: { id: string } };
    await db
      .update(schema.jobs)
      .set({ status: "failed", lastError: "translator rejected the source" })
      .where(eq(schema.jobs.id, firstBody.job.id));

    const retry = await client.api.v1.jobs.$post({ json: stringJob(project.id) }, { headers });
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toEqual({
      job: { id: firstBody.job.id, type: "string", status: "failed" },
    });
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });
});
