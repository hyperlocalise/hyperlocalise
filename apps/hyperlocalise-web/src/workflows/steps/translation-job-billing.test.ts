import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();

  return {
    ...actual,
    env: new Proxy(actual.env, {
      get(target, property, receiver) {
        if (property === "AUTUMN_API_KEY") return "am_sk_test";
        return Reflect.get(target, property, receiver);
      },
    }),
  };
});

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";
import {
  completeFileTranslationJobStep,
  markEmailTranslationJobSucceeded,
} from "@/workflows/steps/translation-job";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await projectFixture.cleanup();
});

function stubAutumnFetch(status = 200) {
  const fetchMock = vi.fn(async () => new Response(status === 200 ? "{}" : "bad", { status }));
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return fetchMock;
}

async function insertRunningTranslationJob(input: {
  organizationId: string;
  projectId: string;
  createdByUserId: string;
  workflowRunId: string;
  type: "string" | "file";
  usageSource: string;
}) {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .insert(schema.jobs)
      .values({
        id: `job_${randomUUID()}`,
        organizationId: input.organizationId,
        projectId: input.projectId,
        createdByUserId: input.createdByUserId,
        kind: "translation",
        status: "running",
        workflowRunId: input.workflowRunId,
        inputPayload: {},
      })
      .returning();

    if (!job) {
      throw new Error("failed to create test translation job");
    }

    await tx.insert(schema.translationJobDetails).values({
      jobId: job.id,
      type: input.type,
    });

    const operationKey = `job:${job.id}:translation_jobs`;
    await tx.insert(schema.usageEvents).values({
      organizationId: input.organizationId,
      featureId: "translation_jobs",
      operationKey,
      source: input.usageSource,
      quantity: 1,
      jobId: job.id,
    });

    return { job, operationKey };
  });
}

async function getJobState(jobId: string) {
  const [job] = await db
    .select({
      status: schema.jobs.status,
      outcomeKind: schema.translationJobDetails.outcomeKind,
      outcomePayload: schema.jobs.outcomePayload,
      lastError: schema.jobs.lastError,
      completedAt: schema.jobs.completedAt,
    })
    .from(schema.jobs)
    .innerJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .where(eq(schema.jobs.id, jobId))
    .limit(1);

  return job;
}

async function getUsageEvent(operationKey: string) {
  const [event] = await db
    .select({
      featureId: schema.usageEvents.featureId,
      status: schema.usageEvents.status,
      quantity: schema.usageEvents.quantity,
      dimensions: schema.usageEvents.dimensions,
      source: schema.usageEvents.source,
      jobId: schema.usageEvents.jobId,
      autumnTrackError: schema.usageEvents.autumnTrackError,
      autumnTrackedAt: schema.usageEvents.autumnTrackedAt,
    })
    .from(schema.usageEvents)
    .where(eq(schema.usageEvents.operationKey, operationKey))
    .limit(1);

  return event;
}

function autumnRequestBody(fetchMock: ReturnType<typeof stubAutumnFetch>) {
  const calls = fetchMock.mock.calls as unknown as Array<Parameters<typeof fetch>>;
  const [, requestInit] = calls[0] ?? [];
  const requestBody = requestInit?.body;
  if (typeof requestBody !== "string") {
    throw new Error("Expected Autumn request body to be a JSON string");
  }

  return JSON.parse(requestBody) as Record<string, unknown>;
}

describe("translation job workflow billing", () => {
  it("tracks completed email translation jobs against the translation_jobs feature meter", async () => {
    const fetchMock = stubAutumnFetch();
    const { project, user } = await projectFixture.createStoredProjectFixture();
    const workflowRunId = `run_${randomUUID()}`;
    const { job, operationKey } = await insertRunningTranslationJob({
      organizationId: project.organizationId,
      projectId: project.id,
      createdByUserId: user.id,
      workflowRunId,
      type: "file",
      usageSource: "email_translation_job_create",
    });

    await markEmailTranslationJobSucceeded({
      jobId: job.id,
      workflowRunId,
      sourceFilename: "welcome.html",
      outputFilename: "welcome.fr.html",
      targetLocale: "fr-FR",
    });

    await expect(getJobState(job.id)).resolves.toMatchObject({
      status: "succeeded",
      outcomeKind: "file_result",
      outcomePayload: {
        kind: "email_file_result",
        sourceFilename: "welcome.html",
        outputFilename: "welcome.fr.html",
        targetLocale: "fr-FR",
      },
      lastError: null,
      completedAt: expect.any(Date),
    });
    await expect(getUsageEvent(operationKey)).resolves.toMatchObject({
      featureId: "translation_jobs",
      status: "tracking_succeeded",
      quantity: 1,
      source: "email_translation_job_create",
      jobId: job.id,
      dimensions: {
        autumn_event_name: "translation_job.completed",
        unit: "job",
        input_tokens: null,
        output_tokens: null,
      },
      autumnTrackError: null,
      autumnTrackedAt: expect.any(Date),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = autumnRequestBody(fetchMock);
    expect(body).toMatchObject({
      customer_id: project.organizationId,
      feature_id: "translation_jobs",
      value: 1,
      idempotency_key: operationKey,
      properties: {
        operation_key: operationKey,
        source: "email_translation_job_create",
        event_name: "translation_job.completed",
        job_id: job.id,
      },
    });
    expect(body).not.toHaveProperty("event_name");
  });

  it("keeps completed file translation jobs succeeded when Autumn tracking fails", async () => {
    const fetchMock = stubAutumnFetch(500);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { project, user } = await projectFixture.createStoredProjectFixture();
    const workflowRunId = `run_${randomUUID()}`;
    const { job, operationKey } = await insertRunningTranslationJob({
      organizationId: project.organizationId,
      projectId: project.id,
      createdByUserId: user.id,
      workflowRunId,
      type: "file",
      usageSource: "translation_job_create",
    });

    await expect(
      completeFileTranslationJobStep({
        jobId: job.id,
        projectId: project.id,
        workflowRunId,
        outputFiles: [{ fileId: "file_fr", locale: "fr-FR", filename: "messages.fr.json" }],
      }),
    ).resolves.toBeUndefined();

    await expect(getJobState(job.id)).resolves.toMatchObject({
      status: "succeeded",
      outcomeKind: "file_result",
      outcomePayload: {
        outputFiles: [{ fileId: "file_fr", locale: "fr-FR", filename: "messages.fr.json" }],
      },
      lastError: null,
      completedAt: expect.any(Date),
    });
    await expect(getUsageEvent(operationKey)).resolves.toMatchObject({
      featureId: "translation_jobs",
      status: "tracking_failed",
      quantity: 1,
      source: "translation_job_create",
      jobId: job.id,
      dimensions: {
        autumn_event_name: "translation_job.completed",
        unit: "job",
      },
      autumnTrackError: "Autumn usage tracking failed with HTTP 500",
      autumnTrackedAt: null,
    });
    expect(autumnRequestBody(fetchMock)).toMatchObject({
      customer_id: project.organizationId,
      feature_id: "translation_jobs",
      value: 1,
      idempotency_key: operationKey,
      properties: {
        operation_key: operationKey,
        source: "translation_job_create",
        event_name: "translation_job.completed",
        job_id: job.id,
      },
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[file-translation-job] Autumn usage tracking failed after job succeeded",
      expect.objectContaining({
        jobId: job.id,
        operationKey,
        error: "Autumn usage tracking failed with HTTP 500",
      }),
    );
  });
});
