import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { ensureGithubRepositoryTables } from "@/api/routes/github-test-fixture";
import { db, schema } from "@/lib/database";
import type { GitHubFixRequestedEventData } from "@/lib/workflow/types";

import {
  buildGitHubFixRequestInput,
  claimGitHubAgentRequest,
  markGitHubAgentRequestEnqueued,
} from "./request-idempotency";

function createEvent(
  overrides: Partial<GitHubFixRequestedEventData> = {},
): GitHubFixRequestedEventData {
  return {
    installationId: 54321,
    repositoryOwner: "hyperlocalise",
    repositoryName: "hyperlocalise",
    repositoryFullName: "hyperlocalise/hyperlocalise",
    pullRequestNumber: 42,
    trigger: {
      event: "pull_request_review_comment",
      action: "created",
      deliveryId: "delivery_123",
      commentId: 123,
    },
    scope: {
      type: "review_comment",
      path: "app.ts",
      line: 10,
      originalLine: 10,
      side: "RIGHT",
      commitSha: "abc123",
      locale: "vi",
    },
    ...overrides,
  };
}

describe("GitHub agent request idempotency", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
    await ensureGithubRepositoryTables();
  });

  afterEach(async () => {
    await db.delete(schema.githubAgentRequests);
  });

  it("returns the existing claim for the same kind, installation, PR, comment, and scope", async () => {
    const request = buildGitHubFixRequestInput(createEvent());

    const first = await claimGitHubAgentRequest(request);
    expect(first.alreadyQueued).toBe(false);
    if (first.alreadyQueued) {
      throw new Error("expected first claim to be new");
    }
    await markGitHubAgentRequestEnqueued({
      requestId: first.requestId,
      workflowRunIds: ["run_123"],
    });

    const duplicate = await claimGitHubAgentRequest(request);

    expect(duplicate).toEqual({
      alreadyQueued: true,
      requestId: first.requestId,
      workflowRunIds: ["run_123"],
    });
  });

  it("does not treat a claimed request as already queued", async () => {
    const request = buildGitHubFixRequestInput(createEvent());

    const first = await claimGitHubAgentRequest(request);
    expect(first.alreadyQueued).toBe(false);

    await expect(claimGitHubAgentRequest(request)).rejects.toThrow(
      "GitHub agent request is claimed but not enqueued",
    );
  });

  it("allows a different comment, scope, or request kind to claim a new request", async () => {
    const first = await claimGitHubAgentRequest(buildGitHubFixRequestInput(createEvent()));
    const differentComment = await claimGitHubAgentRequest(
      buildGitHubFixRequestInput(
        createEvent({
          trigger: {
            event: "pull_request_review_comment",
            action: "created",
            deliveryId: "delivery_456",
            commentId: 456,
          },
        }),
      ),
    );
    const differentScope = await claimGitHubAgentRequest(
      buildGitHubFixRequestInput(
        createEvent({
          scope: {
            type: "review_comment",
            path: "app.ts",
            line: 11,
            originalLine: 11,
            side: "RIGHT",
            commitSha: "abc123",
            locale: "vi",
          },
        }),
      ),
    );
    const differentKind = await claimGitHubAgentRequest({
      ...buildGitHubFixRequestInput(createEvent()),
      requestKind: "review",
    });

    expect(first.alreadyQueued).toBe(false);
    expect(differentComment.alreadyQueued).toBe(false);
    expect(differentScope.alreadyQueued).toBe(false);
    expect(differentKind.alreadyQueued).toBe(false);
  });

  it("uses a numeric fallback comment id when webhook ids are missing", () => {
    const request = buildGitHubFixRequestInput(
      createEvent({
        trigger: {
          event: "pull_request_review_comment",
          action: "created",
          deliveryId: null,
          commentId: null,
        },
      }),
    );

    expect(request.commentId).toBe("0");
  });
});
