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
import {
  extractGitLabMergeRequestReferences,
  extractGitLabProjectPathReferences,
  normalizeGitLabPathWithNamespace,
} from "@/lib/agent-contracts/gitlab-text-patterns";
import type { RepositoryAgentGitLabContext } from "@/lib/agent-contracts/gitlab-repository-task";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { resolveGitLabAccess } from "./access";
import { getGitLabMergeRequest, getGitLabProject, listGitLabMembershipProjects } from "./client";
import { getGitLabConnection } from "./connections";
import { resolveGitLabPipesWorkosUserId } from "./pipes";
import type { GitLabApiError, GitLabProject } from "./types";

export type GitLabContextResolution =
  | { status: "not_applicable" }
  | { status: "resolved"; context: RepositoryAgentGitLabContext }
  | { status: "unresolved"; followUp: string };

export async function listAccessibleGitLabProjects(input: {
  localOrganizationId: string;
  workosUserId: string;
  signal?: AbortSignal;
}): Promise<{ projects: GitLabProject[]; error: GitLabApiError | null }> {
  const access = await resolveGitLabAccess(input);
  if (isErr(access)) {
    if (access.error.code === "gitlab_not_connected") {
      return { projects: [], error: null };
    }
    return { projects: [], error: access.error };
  }

  const projectsResult = await listGitLabMembershipProjects({
    ...access.value,
    signal: input.signal,
  });
  if (isErr(projectsResult)) {
    return { projects: [], error: projectsResult.error };
  }

  return { projects: projectsResult.value, error: null };
}

/** Keeps the reason a project couldn't be used, for callers that can explain it. */
export async function loadGitLabProjectContext(input: {
  localOrganizationId: string;
  workosUserId?: string | null;
  pathWithNamespace: string;
  mergeRequestIid?: number;
  signal?: AbortSignal;
}): Promise<Result<RepositoryAgentGitLabContext, GitLabApiError>> {
  const pathWithNamespace = normalizeGitLabPathWithNamespace(input.pathWithNamespace);
  if (!pathWithNamespace) {
    return err({ code: "gitlab_not_found", message: "GitLab could not find that project." });
  }

  const access = await resolveGitLabAccess(input);
  if (isErr(access)) {
    return access;
  }

  const projectResult = await getGitLabProject({
    ...access.value,
    pathWithNamespace,
    signal: input.signal,
  });
  if (isErr(projectResult)) {
    return projectResult;
  }

  const project = projectResult.value;
  if (input.mergeRequestIid === undefined) {
    return ok({
      resolved: true,
      provider: "gitlab",
      projectId: project.id,
      repositoryFullName: project.pathWithNamespace,
      httpUrlToRepo: project.httpUrlToRepo,
      branch: project.defaultBranch ?? undefined,
    });
  }

  const mergeRequestResult = await getGitLabMergeRequest({
    ...access.value,
    pathWithNamespace: project.pathWithNamespace,
    mergeRequestIid: input.mergeRequestIid,
    signal: input.signal,
  });
  if (isErr(mergeRequestResult)) {
    return mergeRequestResult;
  }

  return ok({
    resolved: true,
    provider: "gitlab",
    projectId: project.id,
    repositoryFullName: project.pathWithNamespace,
    httpUrlToRepo: project.httpUrlToRepo,
    mergeRequestIid: input.mergeRequestIid,
    branch: mergeRequestResult.value.sourceBranch ?? project.defaultBranch ?? undefined,
    commitSha: mergeRequestResult.value.commitSha ?? undefined,
  });
}

export async function resolveGitLabProjectContext(
  input: Parameters<typeof loadGitLabProjectContext>[0],
): Promise<RepositoryAgentGitLabContext | null> {
  const context = await loadGitLabProjectContext(input);
  return isErr(context) ? null : context.value;
}

/** A broken workspace connection is for an admin to fix, so say that rather than "connect". */
function gitlabContextFailureFollowUp(
  error: GitLabApiError,
  hasServer: boolean,
  otherwise: string,
): string {
  if (!hasServer) {
    return otherwise;
  }
  if (error.code === "gitlab_unauthorized" || error.code === "gitlab_connection_decrypt_failed") {
    return "This workspace's GitLab connection isn't working: GitLab refused its token, or the saved token can't be read. An admin or localization manager can check it under Integrations.";
  }
  if (error.code === "gitlab_not_found") {
    return "The workspace's GitLab token can't see that project. Check the link, or ask an admin to give the token access to it.";
  }
  return "The workspace's GitLab couldn't be reached just now. Try again shortly.";
}

export async function resolveConversationRepositoryGitLabContext(input: {
  organizationId: string;
  localUserId?: string | null;
  workosUserId?: string | null;
  text: string;
  /** The latest message alone, so an old GitLab.com link doesn't stop every later turn. */
  currentText?: string;
}): Promise<GitLabContextResolution> {
  const workosUserId = await resolveGitLabPipesWorkosUserId({
    workosUserId: input.workosUserId,
    localUserId: input.localUserId,
  });
  const connection = await getGitLabConnection({ organizationId: input.organizationId });
  if (!workosUserId && !connection) {
    return { status: "not_applicable" };
  }

  const serverUrl = connection?.serverUrl;
  const mergeRequests = extractGitLabMergeRequestReferences(input.text, serverUrl);
  if (mergeRequests.length > 1) {
    return {
      status: "unresolved",
      followUp:
        "I found more than one GitLab merge request link. Please send one MR URL so I know which project to clone.",
    };
  }

  if (mergeRequests.length === 1) {
    const reference = mergeRequests[0]!;
    const context = await loadGitLabProjectContext({
      localOrganizationId: input.organizationId,
      workosUserId,
      pathWithNamespace: reference.pathWithNamespace,
      mergeRequestIid: reference.mergeRequestIid,
    });
    if (isErr(context)) {
      return {
        status: "unresolved",
        followUp: gitlabContextFailureFollowUp(
          context.error,
          connection !== null,
          "I found a GitLab merge request, but I can't access that project with the connected GitLab account. Connect GitLab in Integrations and try again.",
        ),
      };
    }
    return { status: "resolved", context: context.value };
  }

  const projectPaths = extractGitLabProjectPathReferences(input.text, serverUrl);
  if (projectPaths.length > 1) {
    return {
      status: "unresolved",
      followUp:
        "I found more than one GitLab project. Please send one GitLab URL so I know which repository to clone.",
    };
  }

  if (projectPaths.length === 1) {
    const context = await loadGitLabProjectContext({
      localOrganizationId: input.organizationId,
      workosUserId,
      pathWithNamespace: projectPaths[0]!,
    });
    if (isErr(context)) {
      return {
        status: "unresolved",
        followUp: gitlabContextFailureFollowUp(
          context.error,
          connection !== null,
          "I found a GitLab project URL, but I can't access that project with the connected GitLab account. Connect GitLab in Integrations and try again.",
        ),
      };
    }
    return { status: "resolved", context: context.value };
  }

  if (
    connection &&
    (extractGitLabMergeRequestReferences(input.currentText ?? input.text).length > 0 ||
      extractGitLabProjectPathReferences(input.currentText ?? input.text).length > 0)
  ) {
    return {
      status: "unresolved",
      followUp: `This workspace is connected to GitLab at ${connection.serverUrl}, so links from elsewhere aren't used here. Send a link from ${connection.serverUrl} instead.`,
    };
  }

  return { status: "not_applicable" };
}

export function buildRepositoryGitLabContextInstructions(
  context: RepositoryAgentGitLabContext,
): string {
  return [
    "Resolved GitLab repository context:",
    `- provider: gitlab`,
    `- repository: ${context.repositoryFullName}`,
    context.mergeRequestIid === undefined ? null : `- mergeRequestIid: ${context.mergeRequestIid}`,
    context.branch ? `- branch: ${context.branch}` : null,
    context.commitSha ? `- commitSha: ${context.commitSha}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
