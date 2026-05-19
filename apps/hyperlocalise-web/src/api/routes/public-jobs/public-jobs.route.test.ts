import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db } from "@/lib/database";
import type { TranslationJobEventData } from "@/lib/workflow/types";

import {
  createPublicApiFixture,
  insertStoredSourceFile,
  insertCompletedPublicFileJob,
  cleanupPublicApiFixture,
  ensurePublicJobsTestSchema,
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
  await ensurePublicJobsTestSchema();
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
});
