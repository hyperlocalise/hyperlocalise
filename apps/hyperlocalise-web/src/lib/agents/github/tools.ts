import { tool } from "ai";
import { z } from "zod";

import type { GitHubFixQueue, GitHubFixRequestedEventData } from "@/lib/workflow/types";

type CreateGitHubFixToolInput = {
  event: GitHubFixRequestedEventData;
  queue: GitHubFixQueue;
};

export function createGitHubFixTools({ event, queue }: CreateGitHubFixToolInput) {
  let enqueued = false;

  return {
    enqueueGitHubFix: tool({
      description:
        "Queue the validated GitHub pull request fix workflow. This tool must only be used after the command router has validated the GitHub context.",
      inputSchema: z.object({}),
      execute: async () => {
        if (enqueued) {
          return {
            success: true,
            alreadyQueued: true,
            repository: event.repositoryFullName,
            pullRequestNumber: event.pullRequestNumber,
          };
        }

        enqueued = true;
        const result = await queue.enqueue(event);

        return {
          success: true,
          workflowRunIds: result.ids,
          repository: event.repositoryFullName,
          pullRequestNumber: event.pullRequestNumber,
          scope: event.scope.type,
        };
      },
    }),
  };
}
