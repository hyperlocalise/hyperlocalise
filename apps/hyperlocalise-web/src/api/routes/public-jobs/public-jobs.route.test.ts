import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import type { TranslationJobEventData } from "@/lib/workflow/types";

import {
  createPublicApiFixture,
  insertStoredSourceFile,
  insertCompletedPublicFileJob,
  insertRepositoryPublicFileJob,
  cleanupPublicApiFixture,
} from "./public-jobs.fixture";

const enqueueJob = vi.fn(async (event: TranslationJobEventData) => ({
  ids: [event.jobId],
}));

const client = testClient(
  createApp({
    jobQueue: {
      enqueue: enqueueJob,
    },
  }),
);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanupPublicApiFixture();
});

describe("publicJobRoutes", () => {
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

  it("returns the file output contract needed by sync pull", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const job = await insertCompletedPublicFileJob({
      organizationId: project.organizationId,
      projectId: project.id,
      outputFiles: [
        {
          fileId: "file_output_fr",
          locale: "fr-FR",
          filename: "source.fr-FR.xliff",
        },
      ],
    });

    const response = await client.api.v1.jobs[":jobId"].$get(
      {
        param: {
          jobId: job.id,
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { job: Record<string, unknown> };
    expect(body).toEqual({
      job: {
        id: job.id,
        projectId: project.id,
        type: "file",
        status: "succeeded",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        completedAt: expect.any(String),
        lastError: null,
        outputFiles: [
          {
            fileId: "file_output_fr",
            locale: "fr-FR",
            filename: "source.fr-FR.xliff",
          },
        ],
      },
    });
    expect(body.job).not.toHaveProperty("inputPayload");
    expect(body.job).not.toHaveProperty("workflowRunId");
    expect(body.job).not.toHaveProperty("outcomePayload");
  });

  it("does not expose malformed file output metadata as a valid contract", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const job = await insertCompletedPublicFileJob({
      organizationId: project.organizationId,
      projectId: project.id,
      outputFiles: [
        {
          fileId: "",
          locale: "fr-FR",
          filename: "source.fr-FR.xliff",
        },
      ],
    });

    const response = await client.api.v1.jobs[":jobId"].$get(
      {
        param: {
          jobId: job.id,
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { job: { outputFiles: unknown } };
    expect(body.job.outputFiles).toBeNull();
  });

  it("rejects latest job lookups for another organization's project", async () => {
    const { apiKey } = await createPublicApiFixture();
    const { project: otherProject } = await createPublicApiFixture();

    const response = await client.api.v1.jobs.latest.$get(
      {
        query: {
          projectId: otherProject.id,
          sourcePath: "locales/en/source.xliff",
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({
      error: "project_not_found",
      message: expect.any(String),
    });
  });

  it("returns the newest succeeded repository file job by source upload order", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const olderJob = await insertRepositoryPublicFileJob({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath: "locales/en/source.xliff",
      sourceHash: "sha256:older",
      status: "succeeded",
      versionCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
      jobCreatedAt: new Date("2026-01-01T00:01:00.000Z"),
      completedAt: new Date("2026-01-04T00:00:00.000Z"),
      outputFiles: [
        {
          fileId: "file_output_older_fr",
          locale: "fr-FR",
          filename: "source.older.fr-FR.xliff",
        },
      ],
    });
    const newerJob = await insertRepositoryPublicFileJob({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath: "locales/en/source.xliff",
      sourceHash: "sha256:newer",
      status: "succeeded",
      versionCreatedAt: new Date("2026-01-02T00:00:00.000Z"),
      jobCreatedAt: new Date("2026-01-02T00:01:00.000Z"),
      completedAt: new Date("2026-01-03T00:00:00.000Z"),
      outputFiles: [
        {
          fileId: "file_output_newer_fr",
          locale: "fr-FR",
          filename: "source.newer.fr-FR.xliff",
        },
      ],
    });

    const response = await client.api.v1.jobs.latest.$get(
      {
        query: {
          projectId: project.id,
          sourcePath: "locales/en/source.xliff",
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { job: { id: string; outputFiles: unknown } };
    expect(body.job.id).toBe(newerJob.id);
    expect(body.job.id).not.toBe(olderJob.id);
    expect(body.job.outputFiles).toEqual([
      {
        fileId: "file_output_newer_fr",
        locale: "fr-FR",
        filename: "source.newer.fr-FR.xliff",
      },
    ]);
  });

  it("falls back to the previous succeeded repository file job while the latest push is queued", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const previousJob = await insertRepositoryPublicFileJob({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath: "locales/en/source.xliff",
      sourceHash: "sha256:previous",
      status: "succeeded",
      versionCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
      jobCreatedAt: new Date("2026-01-01T00:01:00.000Z"),
      completedAt: new Date("2026-01-01T00:10:00.000Z"),
      outputFiles: [
        {
          fileId: "file_output_previous_fr",
          locale: "fr-FR",
          filename: "source.previous.fr-FR.xliff",
        },
      ],
    });
    await insertRepositoryPublicFileJob({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath: "locales/en/source.xliff",
      sourceHash: "sha256:queued",
      status: "queued",
      versionCreatedAt: new Date("2026-01-02T00:00:00.000Z"),
      jobCreatedAt: new Date("2026-01-02T00:01:00.000Z"),
    });

    const response = await client.api.v1.jobs.latest.$get(
      {
        query: {
          projectId: project.id,
          sourcePath: "locales/en/source.xliff",
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { job: { id: string; outputFiles: unknown } };
    expect(body.job.id).toBe(previousJob.id);
    expect(body.job.outputFiles).toEqual([
      {
        fileId: "file_output_previous_fr",
        locale: "fr-FR",
        filename: "source.previous.fr-FR.xliff",
      },
    ]);
  });
});
