import { and, eq, isNull, or } from "drizzle-orm";

import { stringTranslationJobInputSchema } from "@/api/routes/project/job.schema";
import { db, schema } from "@/lib/database";
import type { TranslationJobEventData } from "@/lib/workflow/types";
import { persistStringJobTranslations } from "@/lib/projects/translations/project-translation-service";
import {
  formatUsageControlError,
  markUsageEventSucceededByOperationKey,
  trackUsageEventInAutumnByOperationKey,
} from "@/lib/billing/usage-control";
import { isErr } from "@/lib/primitives/result/results";
import {
  defaultGlossaryMatchResolution,
  defaultTranslationMemoryMatchResolution,
} from "@/lib/providers/capabilities/match-resolution";
import { assembleStringTranslationContextSnapshot } from "@/lib/translation/assemble-translation-context";
import { loadOrganizationTranslationGenerator } from "@/lib/translation/load-organization-translation-generator";
import {
  type StringTranslationGenerator,
  type StringTranslationJobResult,
} from "@/lib/translation/string-job-executor";

type ClaimTranslationJobInput = {
  event: TranslationJobEventData;
  runId: string;
};

type StoredTranslationJob = NonNullable<Awaited<ReturnType<typeof getStoredJob>>>;

export type ClaimedTranslationJob = {
  id: string;
  projectId: string;
  type: "string" | "file";
  inputPayload: unknown;
  workflowRunId: string;
};

export type ClaimTranslationJobResult =
  | {
      kind: "claimed";
      job: ClaimedTranslationJob;
    }
  | {
      kind: "skipped";
      job: StoredTranslationJob;
    };

export type TranslationJobExecutionResult =
  | {
      ok: true;
      result: StringTranslationJobResult;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

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

export async function claimTranslationJob(input: ClaimTranslationJobInput) {
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

  const contextSnapshot = await assembleStringTranslationContextSnapshot(
    claimedJob.projectId,
    parsedInput.data,
    undefined,
    {
      translationMemoryMatchResolution: defaultTranslationMemoryMatchResolution,
      glossaryMatchResolution: defaultGlossaryMatchResolution,
    },
  );
  if (!contextSnapshot.ok) {
    return {
      ok: false,
      code: contextSnapshot.code,
      message: contextSnapshot.message,
    };
  }

  await db
    .update(schema.jobs)
    .set({ contextSnapshot: contextSnapshot.snapshot })
    .where(and(eq(schema.jobs.id, claimedJob.id), eq(schema.jobs.projectId, claimedJob.projectId)));

  if (translateStringJobOverride) {
    const result = await translateStringJobOverride({
      projectName: contextSnapshot.snapshot.project.name,
      projectTranslationContext: contextSnapshot.snapshot.project.translationContext,
      jobInput: parsedInput.data,
      contextSnapshot: contextSnapshot.snapshot,
    });

    return {
      ok: true,
      result,
    };
  }

  const organizationGenerator = await loadOrganizationTranslationGenerator(claimedJob.projectId);

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
    contextSnapshot: contextSnapshot.snapshot,
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

  const parsedInput = stringTranslationJobInputSchema.safeParse(
    (await getStoredJob(input.jobId, input.projectId))?.inputPayload,
  );

  if (parsedInput.success) {
    const [project] = await db
      .select({ organizationId: schema.projects.organizationId })
      .from(schema.projects)
      .where(eq(schema.projects.id, input.projectId))
      .limit(1);

    if (project?.organizationId) {
      try {
        await persistStringJobTranslations({
          organizationId: project.organizationId,
          projectId: input.projectId,
          jobId: input.jobId,
          sourceLocale: parsedInput.data.sourceLocale,
          translations: input.result.translations,
          translationKeyId: parsedInput.data.translationKeyId,
        });
      } catch (error) {
        console.warn("[translation-job] string translation persistence failed", {
          jobId: input.jobId,
          projectId: input.projectId,
          organizationId: project.organizationId,
          translationKeyId: parsedInput.data.translationKeyId,
          error,
        });
      }
    }
  }

  const operationKey = `job:${input.jobId}:translation_jobs`;
  const tokenUsage = input.result.tokenUsage;
  const usageQuantity =
    tokenUsage?.totalTokens && tokenUsage.totalTokens > 0 ? tokenUsage.totalTokens : 1;
  const markUsageResult = await markUsageEventSucceededByOperationKey({
    operationKey,
    quantity: usageQuantity,
    dimensions: {
      autumn_event_name: "translation_job.completed",
      unit: tokenUsage ? "model_tokens" : "job",
      input_tokens: tokenUsage?.inputTokens ?? null,
      output_tokens: tokenUsage?.outputTokens ?? null,
    },
  });
  if (isErr(markUsageResult)) {
    throw new Error(formatUsageControlError(markUsageResult.error));
  }

  const trackUsageResult = await trackUsageEventInAutumnByOperationKey({ operationKey });
  if (isErr(trackUsageResult)) {
    console.error("[translation-job] Autumn usage tracking failed after job succeeded", {
      jobId: input.jobId,
      operationKey,
      error: formatUsageControlError(trackUsageResult.error),
    });
  }

  const succeededJob = await getStoredJob(input.jobId, input.projectId);

  if (!succeededJob) {
    throw new Error(`translation job ${input.jobId} was not found in project ${input.projectId}`);
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
