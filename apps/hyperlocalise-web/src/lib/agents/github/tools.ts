import { tool } from "ai";
import { z } from "zod";

import type { GitHubFixQueue, GitHubFixRequestedEventData } from "@/lib/workflow/types";
import {
  buildGitHubFixRequestInput,
  claimGitHubAgentRequest,
  markGitHubAgentRequestEnqueued,
  releaseGitHubAgentRequestClaim,
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

        const claim = await claimGitHubAgentRequest(buildGitHubFixRequestInput(event));
        if (claim.alreadyQueued) {
          enqueued = true;
          return {
            success: true,
            alreadyQueued: true,
            workflowRunIds: claim.workflowRunIds,
            repository: event.repositoryFullName,
            pullRequestNumber: event.pullRequestNumber,
            scope: event.scope.type,
          };
        }

        let result: Awaited<ReturnType<GitHubFixQueue["enqueue"]>>;
        try {
          result = await queue.enqueue(event);
        } catch (error) {
          try {
            await releaseGitHubAgentRequestClaim(claim.requestId);
          } catch {
            // Don't mask the original queue error if release fails
          }
          throw error;
        }
        await markGitHubAgentRequestEnqueued({
          requestId: claim.requestId,
          workflowRunIds: result.ids,
        });
        enqueued = true;

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
