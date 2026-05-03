import { and, eq, isNull, or } from "drizzle-orm";

import { stringTranslationJobInputSchema } from "@/api/routes/project/job.schema";
import { db, schema } from "@/lib/database";
import type { TranslationJobQueuedEventData } from "@/lib/workflow/types";
import { decryptProviderCredential } from "@/lib/security/provider-credential-crypto";
import {
  createOpenAIStringTranslationGenerator,
  type StringTranslationGenerator,
  type StringTranslationJobResult,
} from "@/lib/translation/string-job-executor";

type CreateTranslationJobQueuedFunctionOptions = {
  translateStringJob?: StringTranslationGenerator;
};

type ExecuteTranslationJobQueuedInput = {
  event: TranslationJobQueuedEventData;
  runId: string;
};

type StoredTranslationJob = NonNullable<Awaited<ReturnType<typeof getStoredJob>>>;

type ClaimedTranslationJob = {
  id: string;
  projectId: string;
  type: "string" | "file";
  inputPayload: unknown;
  workflowRunId: string;
};

type ClaimTranslationJobResult =
  | {
      kind: "claimed";
      job: ClaimedTranslationJob;
    }
  | {
      kind: "skipped";
      job: StoredTranslationJob;
    };

type TranslationJobExecutionResult =
  | {
      ok: true;
      result: StringTranslationJobResult;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : "translation job execution failed";
}

async function getStoredJob(jobId: string, projectId: string) {
  const [job] = await db
    .select({
      id: schema.jobs.id,
      projectId: schema.jobs.projectId,
      type: schema.translationJobDetails.type,
      status: schema.jobs.status,
      inputPayload: schema.jobs.inputPayload,
      outcomeKind: schema.translationJobDetails.outcomeKind,
      outcomePayload: schema.jobs.outcomePayload,
      lastError: schema.jobs.lastError,
      workflowRunId: schema.jobs.workflowRunId,
      completedAt: schema.jobs.completedAt,
    })
    .from(schema.jobs)
    .innerJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .where(
      and(
        eq(schema.jobs.kind, "translation"),
        eq(schema.jobs.id, jobId),
        eq(schema.jobs.projectId, projectId),
      ),
    )
    .limit(1);

  return job ? { ...job, projectId: job.projectId ?? projectId } : undefined;
}

/**
 * @deprecated Use a generic job claim helper for new job workers. This remains
 * scoped to translation jobs while the translation worker is migrated.
 */
export async function claimTranslationJob(input: ExecuteTranslationJobQueuedInput) {
  const attachedJob = await db
    .update(schema.jobs)
    .set({
      workflowRunId: input.runId,
    })
    .where(
      and(
        eq(schema.jobs.kind, "translation"),
        eq(schema.jobs.id, input.event.jobId),
        eq(schema.jobs.projectId, input.event.projectId),
        isNull(schema.jobs.workflowRunId),
      ),
    )
    .returning({
      id: schema.jobs.id,
      projectId: schema.jobs.projectId,
      runId: schema.jobs.workflowRunId,
    })
    .then(async ([job]) => {
      if (job) {
        const storedJob = await getStoredJob(job.id, job.projectId ?? input.event.projectId);

        if (!storedJob) {
          throw new Error(
            `translation job ${input.event.jobId} was not found in project ${input.event.projectId}`,
          );
        }

        return {
          id: storedJob.id,
          projectId: storedJob.projectId,
          type: storedJob.type,
          runId: input.runId,
          ownedByCurrentRun: true,
        };
      }

      const existingJob = await getStoredJob(input.event.jobId, input.event.projectId);

      if (!existingJob) {
        throw new Error(
          `translation job ${input.event.jobId} was not found in project ${input.event.projectId}`,
        );
      }

      return {
        id: existingJob.id,
        projectId: existingJob.projectId,
        type: existingJob.type,
        runId: existingJob.workflowRunId,
        ownedByCurrentRun: existingJob.workflowRunId === input.runId,
      };
    });

  if (!attachedJob.runId) {
    throw new Error(
      `translation job ${input.event.jobId} does not have an associated workflow run id`,
    );
  }

  if (!attachedJob.ownedByCurrentRun) {
    const existingJob = await getStoredJob(input.event.jobId, input.event.projectId);

    if (!existingJob) {
      throw new Error(
        `translation job ${input.event.jobId} was not found in project ${input.event.projectId}`,
      );
    }

    return {
      kind: "skipped",
      job: existingJob,
    } satisfies ClaimTranslationJobResult;
  }

  const [claimedJob] = await db
    .update(schema.jobs)
    .set({
      status: "running",
      lastError: null,
      outcomePayload: null,
      completedAt: null,
    })
    .where(
      and(
        eq(schema.jobs.kind, "translation"),
        eq(schema.jobs.id, input.event.jobId),
        eq(schema.jobs.projectId, input.event.projectId),
        or(eq(schema.jobs.status, "queued"), eq(schema.jobs.status, "running")),
        eq(schema.jobs.workflowRunId, attachedJob.runId),
      ),
    )
    .returning({
      id: schema.jobs.id,
      projectId: schema.jobs.projectId,
      inputPayload: schema.jobs.inputPayload,
    });

  if (!claimedJob) {
    const existingJob = await getStoredJob(input.event.jobId, input.event.projectId);

    if (!existingJob) {
      throw new Error(
        `translation job ${input.event.jobId} was not found in project ${input.event.projectId}`,
      );
    }

    return {
      kind: "skipped",
      job: existingJob,
    } satisfies ClaimTranslationJobResult;
  }

  await db
    .update(schema.translationJobDetails)
    .set({ outcomeKind: null })
    .where(eq(schema.translationJobDetails.jobId, input.event.jobId));

  return {
    kind: "claimed",
    job: {
      id: claimedJob.id,
      projectId: claimedJob.projectId ?? input.event.projectId,
      type: attachedJob.type,
      inputPayload: claimedJob.inputPayload,
      workflowRunId: attachedJob.runId,
    },
  } satisfies ClaimTranslationJobResult;
}

async function loadOrganizationOpenAITranslationGenerator(projectId: string) {
  const [project] = await db
    .select({
      name: schema.projects.name,
      translationContext: schema.projects.translationContext,
      organizationId: schema.projects.organizationId,
      provider: schema.organizationLlmProviderCredentials.provider,
      defaultModel: schema.organizationLlmProviderCredentials.defaultModel,
      encryptionAlgorithm: schema.organizationLlmProviderCredentials.encryptionAlgorithm,
      ciphertext: schema.organizationLlmProviderCredentials.ciphertext,
      iv: schema.organizationLlmProviderCredentials.iv,
      authTag: schema.organizationLlmProviderCredentials.authTag,
      keyVersion: schema.organizationLlmProviderCredentials.keyVersion,
    })
    .from(schema.projects)
    .leftJoin(
      schema.organizationLlmProviderCredentials,
      and(
        eq(
          schema.organizationLlmProviderCredentials.organizationId,
          schema.projects.organizationId,
        ),
        eq(schema.organizationLlmProviderCredentials.provider, "openai"),
      ),
    )
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  if (!project) {
    return {
      ok: false,
      code: "translation_project_not_found",
      message: `translation project ${projectId} was not found`,
    } as const;
  }

  if (!project.provider) {
    const [anyCredential] = await db
      .select({
        provider: schema.organizationLlmProviderCredentials.provider,
      })
      .from(schema.organizationLlmProviderCredentials)
      .where(eq(schema.organizationLlmProviderCredentials.organizationId, project.organizationId))
      .limit(1);

    if (anyCredential) {
      return {
        ok: false,
        code: "unsupported_provider",
        message: `translation jobs support OpenAI provider credentials only, got ${anyCredential.provider}`,
      } as const;
    }

    return {
      ok: false,
      code: "provider_credential_missing",
      message: "organization OpenAI provider credential is not configured",
    } as const;
  }

  if (project.provider !== "openai") {
    return {
      ok: false,
      code: "unsupported_provider",
      message: `translation jobs support OpenAI provider credentials only, got ${project.provider}`,
    } as const;
  }

  if (
    !project.defaultModel ||
    !project.encryptionAlgorithm ||
    !project.ciphertext ||
    !project.iv ||
    !project.authTag ||
    project.keyVersion === null
  ) {
    return {
      ok: false,
      code: "provider_credential_invalid",
      message: "organization OpenAI provider credential is incomplete",
    } as const;
  }

  const apiKey = decryptProviderCredential({
    algorithm: project.encryptionAlgorithm,
    keyVersion: project.keyVersion,
    ciphertext: project.ciphertext,
    iv: project.iv,
    authTag: project.authTag,
  });

  return {
    ok: true,
    project: {
      name: project.name,
      translationContext: project.translationContext,
    },
    translateStringJob: createOpenAIStringTranslationGenerator({
      apiKey,
      model: project.defaultModel,
    }),
  } as const;
}

/**
 * @deprecated Use generic job execution dispatch for new job kinds.
 */
export async function executeClaimedTranslationJob(
  claimedJob: ClaimedTranslationJob,
  translateStringJobOverride?: StringTranslationGenerator,
): Promise<TranslationJobExecutionResult> {
  if (claimedJob.type !== "string") {
    const message = `translation job type ${claimedJob.type} is not supported`;

    return {
      ok: false,
      code: "unsupported_job_type",
      message,
    };
  }

  const parsedInput = stringTranslationJobInputSchema.safeParse(claimedJob.inputPayload);

  if (!parsedInput.success) {
    return {
      ok: false,
      code: "invalid_string_translation_job_input",
      message: "invalid stored string translation job input",
    };
  }

  if (translateStringJobOverride) {
    const [project] = await db
      .select({
        name: schema.projects.name,
        translationContext: schema.projects.translationContext,
      })
      .from(schema.projects)
      .where(eq(schema.projects.id, claimedJob.projectId))
      .limit(1);

    if (!project) {
      return {
        ok: false,
        code: "translation_project_not_found",
        message: `translation project ${claimedJob.projectId} was not found`,
      };
    }

    const result = await translateStringJobOverride({
      projectName: project.name,
      projectTranslationContext: project.translationContext,
      jobInput: parsedInput.data,
    });

    return {
      ok: true,
      result,
    };
  }

  const organizationGenerator = await loadOrganizationOpenAITranslationGenerator(
    claimedJob.projectId,
  );

  if (!organizationGenerator.ok) {
    return {
      ok: false,
      code: organizationGenerator.code,
      message: organizationGenerator.message,
    };
  }

  const result = await organizationGenerator.translateStringJob({
    projectName: organizationGenerator.project.name,
    projectTranslationContext: organizationGenerator.project.translationContext,
    jobInput: parsedInput.data,
  });

  return {
    ok: true,
    result,
  };
}

/**
 * @deprecated Use generic job completion helpers plus type-specific detail updates.
 */
export async function completeTranslationJob(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  result: StringTranslationJobResult;
}) {
  const didSucceed = await db.transaction(async (tx) => {
    const [updatedJob] = await tx
      .update(schema.jobs)
      .set({
        status: "succeeded",
        outcomePayload: input.result,
        lastError: null,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(schema.jobs.kind, "translation"),
          eq(schema.jobs.id, input.jobId),
          eq(schema.jobs.projectId, input.projectId),
          eq(schema.jobs.workflowRunId, input.workflowRunId),
        ),
      )
      .returning({ id: schema.jobs.id });

    if (!updatedJob) {
      return false;
    }

    await tx
      .update(schema.translationJobDetails)
      .set({ outcomeKind: "string_result" })
      .where(eq(schema.translationJobDetails.jobId, input.jobId));

    return true;
  });

  if (!didSucceed) {
    throw new Error(
      `translation job ${input.jobId} is not owned by workflow run ${input.workflowRunId}`,
    );
  }

  const succeededJob = await getStoredJob(input.jobId, input.projectId);

  if (!succeededJob) {
    throw new Error(`translation job ${input.jobId} was not found in project ${input.projectId}`);
  }

  return succeededJob;
}

/**
 * @deprecated Use generic job failure helpers plus type-specific detail updates.
 */
export async function failTranslationJob(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  code: string;
  message: string;
}) {
  const didFail = await db.transaction(async (tx) => {
    const [updatedJob] = await tx
      .update(schema.jobs)
      .set({
        status: "failed",
        outcomePayload: {
          code: input.code,
          message: input.message,
        },
        lastError: input.message,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(schema.jobs.kind, "translation"),
          eq(schema.jobs.id, input.jobId),
          eq(schema.jobs.projectId, input.projectId),
          eq(schema.jobs.workflowRunId, input.workflowRunId),
        ),
      )
      .returning({ id: schema.jobs.id });

    if (!updatedJob) {
      return false;
    }

    await tx
      .update(schema.translationJobDetails)
      .set({ outcomeKind: "error" })
      .where(eq(schema.translationJobDetails.jobId, input.jobId));

    return true;
  });

  if (!didFail) {
    throw new Error(
      `translation job ${input.jobId} is not owned by workflow run ${input.workflowRunId}`,
    );
  }

  const failedJob = await getStoredJob(input.jobId, input.projectId);

  if (!failedJob) {
    throw new Error(`translation job ${input.jobId} was not found in project ${input.projectId}`);
  }

  return failedJob;
}

/**
 * @deprecated Use a generic queued-job workflow function for new job kinds.
 */
export function createTranslationJobQueuedFunction(
  options: CreateTranslationJobQueuedFunctionOptions = {},
) {
  const translateStringJob = options.translateStringJob;

  return async ({ event, runId }: ExecuteTranslationJobQueuedInput) => {
    const claim = await claimTranslationJob({ event, runId });

    if (claim.kind === "skipped") {
      return claim.job;
    }

    try {
      const execution = await executeClaimedTranslationJob(claim.job, translateStringJob);

      if (!execution.ok) {
        return failTranslationJob({
          jobId: claim.job.id,
          projectId: claim.job.projectId,
          workflowRunId: claim.job.workflowRunId,
          code: execution.code,
          message: execution.message,
        });
      }

      return completeTranslationJob({
        jobId: claim.job.id,
        projectId: claim.job.projectId,
        workflowRunId: claim.job.workflowRunId,
        result: execution.result,
      });
    } catch (error) {
      const message = formatExecutionError(error);

      return failTranslationJob({
        jobId: claim.job.id,
        projectId: claim.job.projectId,
        workflowRunId: claim.job.workflowRunId,
        code: "translation_execution_failed",
        message,
      });
    }
  };
}

/**
 * @deprecated Use generic queued-job execution for new job kinds.
 */
export const executeTranslationJobQueued = createTranslationJobQueuedFunction();
