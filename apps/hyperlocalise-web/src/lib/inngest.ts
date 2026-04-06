import { and, eq, isNull } from "drizzle-orm";
import { Inngest } from "inngest";

import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";

export const TRANSLATION_JOB_QUEUED_EVENT = "translation/job.queued";

export type TranslationJobQueuedEventData = {
  jobId: string;
  projectId: string;
  type: "string" | "file";
};

export type TranslationJobQueue = {
  enqueue(event: TranslationJobQueuedEventData): Promise<{ ids: string[] }>;
};

export function getTranslationJobQueuedEventId(jobId: string) {
  return `translation-job-queued:${jobId}`;
}

export const inngest = new Inngest({
  id: "hyperlocalise-web",
  eventKey: env.INNGEST_EVENT_KEY,
});

export function createInngestTranslationJobQueue(client: Inngest = inngest): TranslationJobQueue {
  return {
    enqueue(event) {
      return client.send({
        id: getTranslationJobQueuedEventId(event.jobId),
        name: TRANSLATION_JOB_QUEUED_EVENT,
        data: event,
      });
    },
  };
}

export const translationJobQueuedFunction = inngest.createFunction(
  {
    id: "translation-job-queued",
    triggers: [{ event: TRANSLATION_JOB_QUEUED_EVENT }],
  },
  async ({ event, runId, step }) => {
    return step.run("attach-workflow-run-id", async () => {
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
        };
      }

      const [existingJob] = await db
        .select({
          id: schema.translationJobs.id,
          projectId: schema.translationJobs.projectId,
          type: schema.translationJobs.type,
          runId: schema.translationJobs.workflowRunId,
        })
        .from(schema.translationJobs)
        .where(
          and(
            eq(schema.translationJobs.id, event.data.jobId),
            eq(schema.translationJobs.projectId, event.data.projectId),
          ),
        )
        .limit(1);

      if (!existingJob) {
        throw new Error(
          `translation job ${event.data.jobId} was not found in project ${event.data.projectId}`,
        );
      }

      return {
        ...existingJob,
        runId: existingJob.runId,
      };
    });
  },
);

export const functions = [translationJobQueuedFunction];
