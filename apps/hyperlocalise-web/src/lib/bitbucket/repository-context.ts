/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { RepositoryAgentBitbucketContext } from "@/lib/agent-contracts/bitbucket-repository-task";
import {
  extractBitbucketPullRequestReferences,
  extractBitbucketRepositoryReferences,
  normalizeBitbucketRepositoryFullName,
} from "@/lib/agent-contracts/bitbucket-text-patterns";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { getBitbucketPullRequest, getBitbucketRepository } from "./client";
import { loadBitbucketAccess, resolveBitbucketCredentialOwner } from "./pipes";
import type { BitbucketApiError } from "./types";

export type BitbucketContextResolution =
  | { status: "not_applicable" }
  | { status: "resolved"; context: RepositoryAgentBitbucketContext }
  | { status: "unresolved"; followUp: string };

/** Keeps the reason a repository couldn't be used, for callers that can explain it. */
export async function loadBitbucketRepositoryContext(input: {
  localOrganizationId: string;
  repositoryFullName: string;
  pullRequestId?: number;
  signal?: AbortSignal;
}): Promise<Result<RepositoryAgentBitbucketContext, BitbucketApiError>> {
  const fullName = normalizeBitbucketRepositoryFullName(input.repositoryFullName);
  if (!fullName) {
    return err({ code: "bitbucket_not_found", message: "Bitbucket could not find that." });
  }

  const access = await loadBitbucketAccess({ localOrganizationId: input.localOrganizationId });
  if (isErr(access)) {
    return access;
  }

  const repositoryResult = await getBitbucketRepository({
    ...access.value,
    fullName,
    signal: input.signal,
  });
  if (isErr(repositoryResult)) {
    return repositoryResult;
  }
  const repository = repositoryResult.value;
  const base = {
    resolved: true as const,
    provider: "bitbucket" as const,
    repositoryUuid: repository.uuid,
    repositoryFullName: repository.fullName,
  };

  if (input.pullRequestId === undefined) {
    return ok({ ...base, ...(repository.mainBranch ? { branch: repository.mainBranch } : {}) });
  }

  const pullRequestResult = await getBitbucketPullRequest({
    ...access.value,
    fullName: repository.fullName,
    pullRequestId: input.pullRequestId,
    signal: input.signal,
  });
  if (isErr(pullRequestResult)) {
    return pullRequestResult;
  }
  const pullRequest = pullRequestResult.value;
  // A fork's branch isn't in this repository, so its clone reads the branch the change targets.
  const fromThisRepository =
    pullRequest.sourceRepositoryFullName === null ||
    pullRequest.sourceRepositoryFullName.toLowerCase() === repository.fullName.toLowerCase();
  const branch =
    (fromThisRepository ? pullRequest.sourceBranch : pullRequest.destinationBranch) ??
    repository.mainBranch;

  return ok({
    ...base,
    pullRequestId: input.pullRequestId,
    ...(branch ? { branch } : {}),
  });
}

export async function resolveBitbucketRepositoryContext(
  input: Parameters<typeof loadBitbucketRepositoryContext>[0],
): Promise<RepositoryAgentBitbucketContext | null> {
  const context = await loadBitbucketRepositoryContext(input);
  return isErr(context) ? null : context.value;
}

/** A stored repository, kept only while the workspace's Bitbucket connection can still open it. */
export async function keepBitbucketContextIfConnected(input: {
  localOrganizationId: string;
  context: RepositoryAgentBitbucketContext | null | undefined;
}): Promise<RepositoryAgentBitbucketContext | null> {
  if (!input.context) {
    return null;
  }
  const owner = await resolveBitbucketCredentialOwner({
    localOrganizationId: input.localOrganizationId,
  });
  return owner ? input.context : null;
}

function bitbucketContextFailureFollowUp(error: BitbucketApiError, otherwise: string): string {
  switch (error.code) {
    case "bitbucket_not_connected":
      return "I found a Bitbucket link, but this workspace hasn't connected Bitbucket. An admin can connect it under Integrations.";
    case "bitbucket_needs_reconnect":
    case "bitbucket_unauthorized":
      return "I found a Bitbucket link, but this workspace's Bitbucket connection needs to be set up again. An admin can reconnect it under Integrations.";
    case "bitbucket_not_found":
    case "bitbucket_forbidden":
      return otherwise;
    case "bitbucket_unavailable":
    case "bitbucket_request_failed":
      return "Bitbucket couldn't be reached just now. Try again shortly.";
  }
}

export async function resolveConversationRepositoryBitbucketContext(input: {
  organizationId: string;
  text: string;
}): Promise<BitbucketContextResolution> {
  const pullRequests = extractBitbucketPullRequestReferences(input.text);
  if (pullRequests.length > 1) {
    return {
      status: "unresolved",
      followUp:
        "I found more than one Bitbucket pull request link. Please send one pull request URL so I know which repository to clone.",
    };
  }

  if (pullRequests.length === 1) {
    const reference = pullRequests[0]!;
    const context = await loadBitbucketRepositoryContext({
      localOrganizationId: input.organizationId,
      repositoryFullName: reference.repositoryFullName,
      pullRequestId: reference.pullRequestId,
    });
    if (isErr(context)) {
      return {
        status: "unresolved",
        followUp: bitbucketContextFailureFollowUp(
          context.error,
          "I found a Bitbucket pull request, but the workspace's Bitbucket connection can't open it. Check the link, or ask an admin to give the connected account access to that repository.",
        ),
      };
    }
    return { status: "resolved", context: context.value };
  }

  const repositories = extractBitbucketRepositoryReferences(input.text);
  if (repositories.length > 1) {
    return {
      status: "unresolved",
      followUp:
        "I found more than one Bitbucket repository. Please send one Bitbucket URL so I know which repository to clone.",
    };
  }

  if (repositories.length === 1) {
    const context = await loadBitbucketRepositoryContext({
      localOrganizationId: input.organizationId,
      repositoryFullName: repositories[0]!,
    });
    if (isErr(context)) {
      return {
        status: "unresolved",
        followUp: bitbucketContextFailureFollowUp(
          context.error,
          "I found a Bitbucket repository URL, but the workspace's Bitbucket connection can't open it. Check the link, or ask an admin to give the connected account access to that repository.",
        ),
      };
    }
    return { status: "resolved", context: context.value };
  }

  return { status: "not_applicable" };
}

export function buildRepositoryBitbucketContextInstructions(
  context: RepositoryAgentBitbucketContext,
): string {
  return [
    "Resolved Bitbucket repository context:",
    "- provider: bitbucket",
    `- repository: ${context.repositoryFullName}`,
    context.pullRequestId === undefined ? null : `- pullRequestId: ${context.pullRequestId}`,
    context.branch ? `- branch: ${context.branch}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
