import "dotenv/config";

process.env.INNGEST_EVENT_KEY ??= "test-event-key";
process.env.INNGEST_SIGNING_KEY ??= "test-signing-key";

import { randomUUID } from "node:crypto";

import { InngestTestEngine } from "@inngest/test";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { db, schema } from "@/lib/database";
import { TRANSLATION_JOB_QUEUED_EVENT, getTranslationJobQueuedEventId } from "@/lib/inngest";
import { createTranslationJobQueuedFunction } from "@/lib/translation/translation-job-queued-function";

import { createProjectTestFixture } from "./project.fixture";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

describe("translationJobQueuedFunction", () => {
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

    const translationJobQueuedFunction = createTranslationJobQueuedFunction({
      async translateStringJob() {
        return {
          translations: [{ locale: "fr-FR", text: "Bonjour le monde" }],
        };
      },
    });

    const engine = new InngestTestEngine({
      function: translationJobQueuedFunction,
      events: [
        {
          id: getTranslationJobQueuedEventId(job.id),
          name: TRANSLATION_JOB_QUEUED_EVENT,
          data: {
            jobId: job.id,
            projectId: project.id,
            type: "string",
          },
        },
      ],
    });

    const { result, error } = await engine.execute();

    expect(error).toBeUndefined();
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
    const translationJobQueuedFunction = createTranslationJobQueuedFunction({
      translateStringJob,
    });

    const engine = new InngestTestEngine({
      function: translationJobQueuedFunction,
      events: [
        {
          id: getTranslationJobQueuedEventId(job.id),
          name: TRANSLATION_JOB_QUEUED_EVENT,
          data: {
            jobId: job.id,
            projectId: project.id,
            type: "string",
          },
        },
      ],
    });

    const { result, error } = await engine.execute();

    expect(error).toBeUndefined();
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

  it("marks the job failed when execution raises an error", async () => {
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

    const translationJobQueuedFunction = createTranslationJobQueuedFunction({
      async translateStringJob() {
        throw new Error("openai unavailable");
      },
    });

    const engine = new InngestTestEngine({
      function: translationJobQueuedFunction,
      events: [
        {
          id: getTranslationJobQueuedEventId(job.id),
          name: TRANSLATION_JOB_QUEUED_EVENT,
          data: {
            jobId: job.id,
            projectId: project.id,
            type: "string",
          },
        },
      ],
    });

    const { result, error } = await engine.execute();

    expect(error).toBeUndefined();
    expect(result).toEqual(
      expect.objectContaining({
        id: job.id,
        status: "failed",
        outcomeKind: "error",
        lastError: "openai unavailable",
      }),
    );

    const [storedJob] = await db
      .select({
        status: schema.translationJobs.status,
        outcomeKind: schema.translationJobs.outcomeKind,
        outcomePayload: schema.translationJobs.outcomePayload,
        lastError: schema.translationJobs.lastError,
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

    expect(storedJob).toEqual(
      expect.objectContaining({
        status: "failed",
        outcomeKind: "error",
        outcomePayload: {
          code: "translation_execution_failed",
          message: "openai unavailable",
        },
        lastError: "openai unavailable",
        completedAt: expect.any(Date),
      }),
    );
  });

  it("returns an error when the queued job cannot be found", async () => {
    const missingJobId = `job_missing_${randomUUID()}`;
    const missingProjectId = `project_missing_${randomUUID()}`;
    const translationJobQueuedFunction = createTranslationJobQueuedFunction({
      async translateStringJob() {
        return {
          translations: [{ locale: "fr-FR", text: "Bonjour le monde" }],
        };
      },
    });

    const engine = new InngestTestEngine({
      function: translationJobQueuedFunction,
      events: [
        {
          id: getTranslationJobQueuedEventId(missingJobId),
          name: TRANSLATION_JOB_QUEUED_EVENT,
          data: {
            jobId: missingJobId,
            projectId: missingProjectId,
            type: "string",
          },
        },
      ],
    });

    const { error } = await engine.execute();

    expect(error).toMatchObject({
      message: expect.stringContaining("was not found"),
    });
  });
});
