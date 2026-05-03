import "dotenv/config";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import { encryptProviderCredential } from "@/lib/security/provider-credential-crypto";
import {
  completeTranslationJob,
  createTranslationJobQueuedFunction,
  failTranslationJob,
} from "@/lib/translation/translation-job-queued-function";

import { createProjectTestFixture } from "./project.fixture";

const projectFixture = createProjectTestFixture();

async function insertProviderCredential(input: {
  organizationId: string;
  userId: string;
  provider: "openai" | "anthropic" | "gemini" | "groq" | "mistral";
  defaultModel: string;
}) {
  const encrypted = encryptProviderCredential("test-provider-api-key");

  await db.insert(schema.organizationLlmProviderCredentials).values({
    organizationId: input.organizationId,
    createdByUserId: input.userId,
    updatedByUserId: input.userId,
    provider: input.provider,
    defaultModel: input.defaultModel,
    maskedApiKeySuffix: "-key",
    encryptionAlgorithm: encrypted.algorithm,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    keyVersion: encrypted.keyVersion,
    lastValidatedAt: new Date(),
  });
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

async function insertJob(input: {
  organizationId: string;
  projectId: string;
  createdByUserId: string;
  type: "string" | "file";
  status: "queued" | "running" | "succeeded" | "failed";
  workflowRunId?: string;
  inputPayload: Record<string, unknown>;
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
        status: input.status,
        workflowRunId: input.workflowRunId ?? null,
        inputPayload: input.inputPayload,
      })
      .returning();

    const [details] = await tx
      .insert(schema.translationJobDetails)
      .values({
        jobId: job.id,
        type: input.type,
      })
      .returning();

    return { ...job, type: details.type };
  });
}

describe("executeTranslationJobQueued", () => {
  it("records the workflow run id and completes an existing queued string job", async () => {
    const { project, user } = await projectFixture.createStoredProjectFixture();
    const job = await insertJob({
      organizationId: project.organizationId,
      projectId: project.id,
      createdByUserId: user.id,
      type: "string",
      status: "queued",
      inputPayload: {
        sourceText: "Hello world",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    });

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
        workflowRunId: schema.jobs.workflowRunId,
        status: schema.jobs.status,
        outcomeKind: schema.translationJobDetails.outcomeKind,
        outcomePayload: schema.jobs.outcomePayload,
        completedAt: schema.jobs.completedAt,
      })
      .from(schema.jobs)
      .innerJoin(
        schema.translationJobDetails,
        eq(schema.translationJobDetails.jobId, schema.jobs.id),
      )
      .where(and(eq(schema.jobs.projectId, project.id), eq(schema.jobs.id, job.id)))
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
    const job = await insertJob({
      organizationId: project.organizationId,
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
    });

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
        workflowRunId: schema.jobs.workflowRunId,
        status: schema.jobs.status,
      })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.projectId, project.id), eq(schema.jobs.id, job.id)))
      .limit(1);

    expect(storedJob?.workflowRunId).toBe("run_existing");
    expect(storedJob?.status).toBe("queued");
    expect(translateStringJob).not.toHaveBeenCalled();
  });

  it("does not complete a job owned by another workflow run", async () => {
    const { project, user } = await projectFixture.createStoredProjectFixture();
    const job = await insertJob({
      organizationId: project.organizationId,
      projectId: project.id,
      createdByUserId: user.id,
      type: "string",
      status: "running",
      workflowRunId: "run_existing",
      inputPayload: {
        sourceText: "Hello world",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    });

    await expect(
      completeTranslationJob({
        jobId: job.id,
        projectId: project.id,
        workflowRunId: "run_stale",
        result: {
          translations: [{ locale: "fr-FR", text: "Bonjour le monde" }],
        },
      }),
    ).rejects.toThrow("is not owned by workflow run run_stale");
  });

  it("does not fail a job owned by another workflow run", async () => {
    const { project, user } = await projectFixture.createStoredProjectFixture();
    const job = await insertJob({
      organizationId: project.organizationId,
      projectId: project.id,
      createdByUserId: user.id,
      type: "string",
      status: "running",
      workflowRunId: "run_existing",
      inputPayload: {
        sourceText: "Hello world",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    });

    await expect(
      failTranslationJob({
        jobId: job.id,
        projectId: project.id,
        workflowRunId: "run_stale",
        code: "stale_run",
        message: "stale workflow run",
      }),
    ).rejects.toThrow("is not owned by workflow run run_stale");
  });

  it("fails when the organization has no OpenAI provider credential", async () => {
    const { project, user } = await projectFixture.createStoredProjectFixture();
    const job = await insertJob({
      organizationId: project.organizationId,
      projectId: project.id,
      createdByUserId: user.id,
      type: "string",
      status: "queued",
      inputPayload: {
        sourceText: "Hello world",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    });

    const executeTranslationJobQueued = createTranslationJobQueuedFunction();
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
        status: "failed",
        outcomeKind: "error",
        outcomePayload: {
          code: "provider_credential_missing",
          message: "organization OpenAI provider credential is not configured",
        },
      }),
    );
  });

  it("fails when the organization provider credential is not OpenAI", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    await insertProviderCredential({
      organizationId: organization.id,
      userId: user.id,
      provider: "gemini",
      defaultModel: "gemini-2.0-flash",
    });
    const job = await insertJob({
      organizationId: project.organizationId,
      projectId: project.id,
      createdByUserId: user.id,
      type: "string",
      status: "queued",
      inputPayload: {
        sourceText: "Hello world",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    });

    const executeTranslationJobQueued = createTranslationJobQueuedFunction();
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
        status: "failed",
        outcomeKind: "error",
        outcomePayload: {
          code: "unsupported_provider",
          message: "translation jobs support OpenAI provider credentials only, got gemini",
        },
      }),
    );
  });

  it("fails invalid stored input without calling the translation model", async () => {
    const { project, user } = await projectFixture.createStoredProjectFixture();
    const job = await insertJob({
      organizationId: project.organizationId,
      projectId: project.id,
      createdByUserId: user.id,
      type: "string",
      status: "queued",
      inputPayload: {
        sourceText: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    });

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
        status: "failed",
        outcomeKind: "error",
        outcomePayload: {
          code: "invalid_string_translation_job_input",
          message: "invalid stored string translation job input",
        },
      }),
    );
    expect(translateStringJob).not.toHaveBeenCalled();
  });
});
