import { and, eq, isNull, or } from "drizzle-orm";

import { stringTranslationJobInputSchema } from "@/api/routes/project/translation-job.schema";
import { db, schema } from "@/lib/database";
import type { TranslationJobQueuedEventData } from "@/lib/workflow";
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
      id: schema.translationJobs.id,
      projectId: schema.translationJobs.projectId,
      type: schema.translationJobs.type,
      status: schema.translationJobs.status,
      inputPayload: schema.translationJobs.inputPayload,
      outcomeKind: schema.translationJobs.outcomeKind,
      outcomePayload: schema.translationJobs.outcomePayload,
      lastError: schema.translationJobs.lastError,
      workflowRunId: schema.translationJobs.workflowRunId,
      completedAt: schema.translationJobs.completedAt,
    })
    .from(schema.translationJobs)
    .where(
      and(eq(schema.translationJobs.id, jobId), eq(schema.translationJobs.projectId, projectId)),
    )
    .limit(1);

  return job;
}

export async function claimTranslationJob(input: ExecuteTranslationJobQueuedInput) {
  const attachedJob = await db
    .update(schema.translationJobs)
    .set({
      workflowRunId: input.runId,
    })
    .where(
      and(
        eq(schema.translationJobs.id, input.event.jobId),
        eq(schema.translationJobs.projectId, input.event.projectId),
        isNull(schema.translationJobs.workflowRunId),
      ),
    )
    .returning({
      id: schema.translationJobs.id,
      projectId: schema.translationJobs.projectId,
      type: schema.translationJobs.type,
      runId: schema.translationJobs.workflowRunId,
    })
    .then(async ([job]) => {
      if (job) {
        return {
          ...job,
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
    .update(schema.translationJobs)
    .set({
      status: "running",
      lastError: null,
      outcomeKind: null,
      outcomePayload: null,
      completedAt: null,
    })
    .where(
      and(
        eq(schema.translationJobs.id, input.event.jobId),
        eq(schema.translationJobs.projectId, input.event.projectId),
        or(
          eq(schema.translationJobs.status, "queued"),
          eq(schema.translationJobs.status, "running"),
        ),
        eq(schema.translationJobs.workflowRunId, attachedJob.runId),
      ),
    )
    .returning({
      id: schema.translationJobs.id,
      projectId: schema.translationJobs.projectId,
      type: schema.translationJobs.type,
      inputPayload: schema.translationJobs.inputPayload,
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

  return {
    kind: "claimed",
    job: {
      ...claimedJob,
      workflowRunId: attachedJob.runId,
    },
  } satisfies ClaimTranslationJobResult;
}

async function loadOrganizationOpenAITranslationGenerator(projectId: string) {
  const [project] = await db
    .select({
      name: schema.translationProjects.name,
      translationContext: schema.translationProjects.translationContext,
      organizationId: schema.translationProjects.organizationId,
      provider: schema.organizationLlmProviderCredentials.provider,
      defaultModel: schema.organizationLlmProviderCredentials.defaultModel,
      encryptionAlgorithm: schema.organizationLlmProviderCredentials.encryptionAlgorithm,
      ciphertext: schema.organizationLlmProviderCredentials.ciphertext,
      iv: schema.organizationLlmProviderCredentials.iv,
      authTag: schema.organizationLlmProviderCredentials.authTag,
      keyVersion: schema.organizationLlmProviderCredentials.keyVersion,
    })
    .from(schema.translationProjects)
    .leftJoin(
      schema.organizationLlmProviderCredentials,
      eq(
        schema.organizationLlmProviderCredentials.organizationId,
        schema.translationProjects.organizationId,
      ),
    )
    .where(eq(schema.translationProjects.id, projectId))
    .limit(1);

  if (!project) {
    return {
      ok: false,
      code: "translation_project_not_found",
      message: `translation project ${projectId} was not found`,
    } as const;
  }

  if (!project.provider) {
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
        name: schema.translationProjects.name,
        translationContext: schema.translationProjects.translationContext,
      })
      .from(schema.translationProjects)
      .where(eq(schema.translationProjects.id, claimedJob.projectId))
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

export async function completeTranslationJob(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  result: StringTranslationJobResult;
}) {
  const [succeededJob] = await db
    .update(schema.translationJobs)
    .set({
      status: "succeeded",
      outcomeKind: "string_result",
      outcomePayload: input.result,
      lastError: null,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.translationJobs.id, input.jobId),
        eq(schema.translationJobs.projectId, input.projectId),
        eq(schema.translationJobs.workflowRunId, input.workflowRunId),
      ),
    )
    .returning({
      id: schema.translationJobs.id,
      projectId: schema.translationJobs.projectId,
      type: schema.translationJobs.type,
      status: schema.translationJobs.status,
      workflowRunId: schema.translationJobs.workflowRunId,
      outcomeKind: schema.translationJobs.outcomeKind,
      outcomePayload: schema.translationJobs.outcomePayload,
      lastError: schema.translationJobs.lastError,
      completedAt: schema.translationJobs.completedAt,
    });

  if (!succeededJob) {
    throw new Error(
      `translation job ${input.jobId} is not owned by workflow run ${input.workflowRunId}`,
    );
  }

  return succeededJob;
}

export async function failTranslationJob(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  code: string;
  message: string;
}) {
  const [failedJob] = await db
    .update(schema.translationJobs)
    .set({
      status: "failed",
      outcomeKind: "error",
      outcomePayload: {
        code: input.code,
        message: input.message,
      },
      lastError: input.message,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.translationJobs.id, input.jobId),
        eq(schema.translationJobs.projectId, input.projectId),
        eq(schema.translationJobs.workflowRunId, input.workflowRunId),
      ),
    )
    .returning({
      id: schema.translationJobs.id,
      projectId: schema.translationJobs.projectId,
      type: schema.translationJobs.type,
      status: schema.translationJobs.status,
      workflowRunId: schema.translationJobs.workflowRunId,
      outcomeKind: schema.translationJobs.outcomeKind,
      outcomePayload: schema.translationJobs.outcomePayload,
      lastError: schema.translationJobs.lastError,
      completedAt: schema.translationJobs.completedAt,
    });

  if (!failedJob) {
    throw new Error(
      `translation job ${input.jobId} is not owned by workflow run ${input.workflowRunId}`,
    );
  }

  return failedJob;
}

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

export const executeTranslationJobQueued = createTranslationJobQueuedFunction();
