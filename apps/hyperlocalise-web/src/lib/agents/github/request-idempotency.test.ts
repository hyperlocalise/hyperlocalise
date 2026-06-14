import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import {
  buildGitHubRepositoryRequestInput,
  claimGitHubAgentRequest,
  GITHUB_AGENT_REQUEST_ENQUEUED_TTL_MS,
  markGitHubAgentRequestEnqueued,
  purgeExpiredGitHubAgentRequests,
} from "./request-idempotency";

function createRepositoryRequest(
  overrides: Partial<ReturnType<typeof buildGitHubRepositoryRequestInput>> = {},
) {
  return {
    ...buildGitHubRepositoryRequestInput({
      installationId: 54321,
      repositoryFullName: "hyperlocalise/hyperlocalise",
      pullRequestNumber: 42,
      commentId: 123,
      instructions: "sync repo translations",
    }),
    ...overrides,
  };
}

describe("GitHub agent request idempotency", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await db.delete(schema.githubAgentRequests);
  });

  it("returns the existing claim for the same kind, installation, PR, comment, and scope", async () => {
    const request = createRepositoryRequest();

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
    const request = createRepositoryRequest();

    const first = await claimGitHubAgentRequest(request);
    expect(first.alreadyQueued).toBe(false);

    await expect(claimGitHubAgentRequest(request)).rejects.toThrow(
      "GitHub agent request is claimed but not enqueued",
    );
  });

  it("allows a different comment, scope, or request kind to claim a new request", async () => {
    const first = await claimGitHubAgentRequest(createRepositoryRequest());
    const differentComment = await claimGitHubAgentRequest(
      createRepositoryRequest({ commentId: "456" }),
    );
    const differentScope = await claimGitHubAgentRequest(
      createRepositoryRequest({ scopeKey: "translate missing keys" }),
    );
    const differentKind = await claimGitHubAgentRequest({
      ...createRepositoryRequest(),
      requestKind: "review",
    });

    expect(first.alreadyQueued).toBe(false);
    expect(differentComment.alreadyQueued).toBe(false);
    expect(differentScope.alreadyQueued).toBe(false);
    expect(differentKind.alreadyQueued).toBe(false);
  });

  it("uses a numeric fallback comment id when webhook ids are missing", () => {
    const request = buildGitHubRepositoryRequestInput({
      installationId: 54321,
      repositoryFullName: "hyperlocalise/hyperlocalise",
      pullRequestNumber: 42,
      commentId: null,
      instructions: "sync repo translations",
    });

    expect(request.commentId).toBe("0");
  });

  it("throws when promoting a deleted request to enqueued", async () => {
    const request = createRepositoryRequest();
    const claim = await claimGitHubAgentRequest(request);
    if (claim.alreadyQueued) {
      throw new Error("expected first claim to be new");
    }

    await db.delete(schema.githubAgentRequests);

    await expect(
      markGitHubAgentRequestEnqueued({
        requestId: claim.requestId,
        workflowRunIds: ["run_123"],
      }),
    ).rejects.toThrow("GitHub agent request no longer exists");
  });

  it("purges expired enqueued requests so the idempotency key can be reclaimed", async () => {
    const request = createRepositoryRequest();
    const first = await claimGitHubAgentRequest(request);
    if (first.alreadyQueued) {
      throw new Error("expected first claim to be new");
    }
    await markGitHubAgentRequestEnqueued({
      requestId: first.requestId,
      workflowRunIds: ["run_123"],
    });

    await db
      .update(schema.githubAgentRequests)
      .set({
        createdAt: new Date(Date.now() - GITHUB_AGENT_REQUEST_ENQUEUED_TTL_MS - 1_000),
      })
      .where(eq(schema.githubAgentRequests.id, first.requestId));

    await purgeExpiredGitHubAgentRequests();

    const reclaimed = await claimGitHubAgentRequest(request);
    expect(reclaimed.alreadyQueued).toBe(false);
  });
});
