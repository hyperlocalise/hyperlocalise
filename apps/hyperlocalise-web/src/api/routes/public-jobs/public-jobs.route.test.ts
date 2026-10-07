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
import { AI_FEATURES_REQUIRED_CODE, AI_FEATURES_REQUIRED_MESSAGE } from "@/lib/billing/ai-features";
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
