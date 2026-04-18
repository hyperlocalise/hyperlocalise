import { and, eq, isNull, or } from "drizzle-orm";

import { stringTranslationJobInputSchema } from "@/api/routes/project/translation-job.schema";
import { db, schema } from "@/lib/database";
import type { TranslationJobQueuedEventData } from "@/lib/workflow";
import {
  translateStringJobWithOpenAI,
  type StringTranslationGenerator,
} from "@/lib/translation/string-job-executor";

type CreateTranslationJobQueuedFunctionOptions = {
  translateStringJob?: StringTranslationGenerator;
};

type ExecuteTranslationJobQueuedInput = {
  event: TranslationJobQueuedEventData;
  runId: string;
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

export function createTranslationJobQueuedFunction(
  options: CreateTranslationJobQueuedFunctionOptions = {},
) {
  const translateStringJob = options.translateStringJob ?? translateStringJobWithOpenAI;

  return async ({ event, runId }: ExecuteTranslationJobQueuedInput) => {
    const attachedJob = await db
      .update(schema.translationJobs)
      .set({
        workflowRunId: runId,
      })
      .where(
        and(
          eq(schema.translationJobs.id, event.jobId),
          eq(schema.translationJobs.projectId, event.projectId),
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
            runId,
            ownedByCurrentRun: true,
          };
        }

        const existingJob = await getStoredJob(event.jobId, event.projectId);

        if (!existingJob) {
          throw new Error(
            `translation job ${event.jobId} was not found in project ${event.projectId}`,
          );
        }

        return {
          id: existingJob.id,
          projectId: existingJob.projectId,
          type: existingJob.type,
          runId: existingJob.workflowRunId,
          ownedByCurrentRun: existingJob.workflowRunId === runId,
        };
      });

    if (!attachedJob.runId) {
      throw new Error(`translation job ${event.jobId} does not have an associated workflow run id`);
    }

    if (!attachedJob.ownedByCurrentRun) {
      return getStoredJob(event.jobId, event.projectId);
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
          eq(schema.translationJobs.id, event.jobId),
          eq(schema.translationJobs.projectId, event.projectId),
          or(eq(schema.translationJobs.status, "queued"), eq(schema.translationJobs.status, "running")),
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
      const existingJob = await getStoredJob(event.jobId, event.projectId);

      if (!existingJob) {
        throw new Error(`translation job ${event.jobId} was not found in project ${event.projectId}`);
      }

      return existingJob;
    }

    if (claimedJob.type !== "string") {
      const message = `translation job type ${claimedJob.type} is not supported`;

      const [failedJob] = await db
        .update(schema.translationJobs)
        .set({
          status: "failed",
          outcomeKind: "error",
          outcomePayload: {
            code: "unsupported_job_type",
            message,
          },
          lastError: message,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(schema.translationJobs.id, claimedJob.id),
            eq(schema.translationJobs.projectId, claimedJob.projectId),
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
          `translation job ${claimedJob.id} disappeared before failure could be recorded`,
        );
      }

      return failedJob;
    }

    try {
      const parsedInput = stringTranslationJobInputSchema.safeParse(claimedJob.inputPayload);

      if (!parsedInput.success) {
        throw new Error("invalid stored string translation job input");
      }

      const [project] = await db
        .select({
          name: schema.translationProjects.name,
          translationContext: schema.translationProjects.translationContext,
        })
        .from(schema.translationProjects)
        .where(eq(schema.translationProjects.id, claimedJob.projectId))
        .limit(1);

      if (!project) {
        throw new Error(`translation project ${claimedJob.projectId} was not found`);
      }

      const result = await translateStringJob({
        projectName: project.name,
        projectTranslationContext: project.translationContext,
        jobInput: parsedInput.data,
      });

      const [succeededJob] = await db
        .update(schema.translationJobs)
        .set({
          status: "succeeded",
          outcomeKind: "string_result",
          outcomePayload: result,
          lastError: null,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(schema.translationJobs.id, claimedJob.id),
            eq(schema.translationJobs.projectId, claimedJob.projectId),
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
          `translation job ${claimedJob.id} disappeared before success could be recorded`,
        );
      }

      return succeededJob;
    } catch (error) {
      const message = formatExecutionError(error);

      const [failedJob] = await db
        .update(schema.translationJobs)
        .set({
          status: "failed",
          outcomeKind: "error",
          outcomePayload: {
            code: "translation_execution_failed",
            message,
          },
          lastError: message,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(schema.translationJobs.id, claimedJob.id),
            eq(schema.translationJobs.projectId, claimedJob.projectId),
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
          `translation job ${claimedJob.id} disappeared before failure could be recorded`,
        );
      }

      return failedJob;
    }
  };
}

export const executeTranslationJobQueued = createTranslationJobQueuedFunction();
