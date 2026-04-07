import { Inngest } from "inngest";

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
  isDev: env.NODE_ENV !== "production",
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
