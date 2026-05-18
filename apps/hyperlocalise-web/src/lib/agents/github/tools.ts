import { tool } from "ai";
import { z } from "zod";

import type { GitHubFixQueue, GitHubFixRequestedEventData } from "@/lib/workflow/types";
import {
  buildGitHubFixRequestInput,
  claimGitHubAgentRequest,
  markGitHubAgentRequestEnqueued,
} from "@/lib/agents/github/request-idempotency";

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
        const claim = await claimGitHubAgentRequest(buildGitHubFixRequestInput(event));
        if (claim.alreadyQueued) {
          return {
            success: true,
            alreadyQueued: true,
            workflowRunIds: claim.workflowRunIds,
            repository: event.repositoryFullName,
            pullRequestNumber: event.pullRequestNumber,
            scope: event.scope.type,
          };
        }

        const result = await queue.enqueue(event);
        await markGitHubAgentRequestEnqueued({
          requestId: claim.requestId,
          workflowRunIds: result.ids,
        });

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
