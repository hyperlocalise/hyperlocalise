import "dotenv/config";

process.env.INNGEST_EVENT_KEY ??= "test-event-key";
process.env.INNGEST_SIGNING_KEY ??= "test-signing-key";

import { randomUUID } from "node:crypto";

import { InngestTestEngine } from "@inngest/test";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { db, schema } from "@/lib/database";
import {
  TRANSLATION_JOB_QUEUED_EVENT,
  getTranslationJobQueuedEventId,
  translationJobQueuedFunction,
} from "@/lib/inngest";

import { createProjectTestFixture } from "./project.fixture";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

describe("translationJobQueuedFunction", () => {
  it("records the workflow run id for an existing queued job", async () => {
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
        runId: expect.any(String),
      }),
    );

    const resultWithRunId = result as { runId: string };
    const [storedJob] = await db
      .select({
        workflowRunId: schema.translationJobs.workflowRunId,
      })
      .from(schema.translationJobs)
      .where(
        and(
          eq(schema.translationJobs.projectId, project.id),
          eq(schema.translationJobs.id, job.id),
        ),
      )
      .limit(1);

    expect(storedJob?.workflowRunId).toBe(resultWithRunId.runId);
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
        runId: "run_existing",
      }),
    );

    const [storedJob] = await db
      .select({
        workflowRunId: schema.translationJobs.workflowRunId,
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
  });

  it("returns an error when the queued job cannot be found", async () => {
    const missingJobId = `job_missing_${randomUUID()}`;
    const missingProjectId = `project_missing_${randomUUID()}`;

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
