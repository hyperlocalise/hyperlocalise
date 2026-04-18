import "dotenv/config";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import { createTranslationJobQueuedFunction } from "@/lib/translation/translation-job-queued-function";

import { createProjectTestFixture } from "./project.fixture";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

describe("executeTranslationJobQueued", () => {
  it("records the workflow run id and completes an existing queued string job", async () => {
    const { project, user } = await projectFixture.createStoredProjectFixture();
    const [job] = await db
      .insert(schema.translationJobs)
      .values({
        id: `job_${randomUUID()}`,
        projectId: project.id,
        createdByUserId: user.id,
        type: "string",
        status: "queued",
        inputPayload: {
          sourceText: "Hello world",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      })
      .returning();

    const executeTranslationJobQueued = createTranslationJobQueuedFunction({
      async translateStringJob() {
        return {
          translations: [{ locale: "fr-FR", text: "Bonjour le monde" }],
        };
      },
    });

    const result = await executeTranslationJobQueued({
      runId: `run_${randomUUID()}`,
      event: {
        jobId: job.id,
        projectId: project.id,
        type: "string",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: job.id,
        projectId: project.id,
        type: "string",
        status: "succeeded",
        workflowRunId: expect.any(String),
      }),
    );

    const resultWithRunId = result as { workflowRunId: string };
    const [storedJob] = await db
      .select({
        workflowRunId: schema.translationJobs.workflowRunId,
        status: schema.translationJobs.status,
        outcomeKind: schema.translationJobs.outcomeKind,
        outcomePayload: schema.translationJobs.outcomePayload,
        completedAt: schema.translationJobs.completedAt,
      })
      .from(schema.translationJobs)
      .where(
        and(
          eq(schema.translationJobs.projectId, project.id),
          eq(schema.translationJobs.id, job.id),
        ),
      )
      .limit(1);

    expect(storedJob?.workflowRunId).toBe(resultWithRunId.workflowRunId);
    expect(storedJob?.status).toBe("succeeded");
    expect(storedJob?.outcomeKind).toBe("string_result");
    expect(storedJob?.outcomePayload).toEqual({
      translations: [{ locale: "fr-FR", text: "Bonjour le monde" }],
    });
    expect(storedJob?.completedAt).toBeTruthy();
  });

  it("does not overwrite an existing workflow run id on replay", async () => {
    const { project, user } = await projectFixture.createStoredProjectFixture();
    const [job] = await db
      .insert(schema.translationJobs)
      .values({
        id: `job_${randomUUID()}`,
        projectId: project.id,
        createdByUserId: user.id,
        type: "string",
        status: "queued",
        workflowRunId: "run_existing",
        inputPayload: {
          sourceText: "Hello world",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      })
      .returning();

    const translateStringJob = vi.fn(async () => ({
      translations: [{ locale: "fr-FR", text: "Bonjour le monde" }],
    }));
    const executeTranslationJobQueued = createTranslationJobQueuedFunction({
      translateStringJob,
    });

    const result = await executeTranslationJobQueued({
      runId: `run_${randomUUID()}`,
      event: {
        jobId: job.id,
        projectId: project.id,
        type: "string",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: job.id,
        projectId: project.id,
        type: "string",
        status: "queued",
        workflowRunId: "run_existing",
      }),
    );

    const [storedJob] = await db
      .select({
        workflowRunId: schema.translationJobs.workflowRunId,
        status: schema.translationJobs.status,
      })
      .from(schema.translationJobs)
      .where(
        and(
          eq(schema.translationJobs.projectId, project.id),
          eq(schema.translationJobs.id, job.id),
        ),
      )
      .limit(1);

    expect(storedJob?.workflowRunId).toBe("run_existing");
    expect(storedJob?.status).toBe("queued");
    expect(translateStringJob).not.toHaveBeenCalled();
  });
});
