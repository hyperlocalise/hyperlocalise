import { and, eq, isNull } from "drizzle-orm";

import { stringTranslationJobInputSchema } from "@/api/routes/project/translation-job.schema";
import { db, schema } from "@/lib/database";
import { inngest, TRANSLATION_JOB_QUEUED_EVENT } from "@/lib/inngest";
import {
  translateStringJobWithOpenAI,
  type StringTranslationGenerator,
} from "@/lib/translation/string-job-executor";

type CreateTranslationJobQueuedFunctionOptions = {
  translateStringJob?: StringTranslationGenerator;
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

/**
 * Creates the workflow worker for queued translation jobs.
 *
 * Current v1 behavior:
 * - attaches the Inngest `runId` to the job record
 * - claims `queued` jobs and transitions them to `running`
 * - executes string jobs through the injected generator
 * - persists either `string_result` output or terminal error state
 *
 * File jobs are still treated as unsupported in this worker.
 */
export function createTranslationJobQueuedFunction(
  options: CreateTranslationJobQueuedFunctionOptions = {},
) {
  const translateStringJob = options.translateStringJob ?? translateStringJobWithOpenAI;

  return inngest.createFunction(
    {
      id: "translation-job-queued",
      triggers: [{ event: TRANSLATION_JOB_QUEUED_EVENT }],
    },
    async ({ event, runId, step }) => {
      const attachedJob = await step.run("attach-workflow-run-id", async () => {
        const [job] = await db
          .update(schema.translationJobs)
          .set({
            workflowRunId: runId,
          })
          .where(
            and(
              eq(schema.translationJobs.id, event.data.jobId),
              eq(schema.translationJobs.projectId, event.data.projectId),
              isNull(schema.translationJobs.workflowRunId),
            ),
          )
          .returning({
            id: schema.translationJobs.id,
            projectId: schema.translationJobs.projectId,
            type: schema.translationJobs.type,
            runId: schema.translationJobs.workflowRunId,
          });

        if (job) {
          return {
            ...job,
            runId,
            ownedByCurrentRun: true,
          };
        }

        const existingJob = await getStoredJob(event.data.jobId, event.data.projectId);

        if (!existingJob) {
          throw new Error(
            `translation job ${event.data.jobId} was not found in project ${event.data.projectId}`,
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

      return step.run("execute-string-job", async () => {
        if (!attachedJob.runId) {
          throw new Error(
            `translation job ${event.data.jobId} does not have an associated workflow run id`,
          );
        }

        if (!attachedJob.ownedByCurrentRun) {
          return getStoredJob(event.data.jobId, event.data.projectId);
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
              eq(schema.translationJobs.id, event.data.jobId),
              eq(schema.translationJobs.projectId, event.data.projectId),
              eq(schema.translationJobs.status, "queued"),
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
          const existingJob = await getStoredJob(event.data.jobId, event.data.projectId);

          if (!existingJob) {
            throw new Error(
              `translation job ${event.data.jobId} was not found in project ${event.data.projectId}`,
            );
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

          return failedJob;
        }
      });
    },
  );
}

export const translationJobQueuedFunction = createTranslationJobQueuedFunction();
