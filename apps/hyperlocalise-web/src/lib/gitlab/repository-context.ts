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
  extractGitLabProjectReferences,
  normalizeGitLabPathWithNamespace,
} from "@/lib/agent-contracts/gitlab-text-patterns";
import type { RepositoryAgentGitLabContext } from "@/lib/agent-contracts/gitlab-repository-task";
import { isErr } from "@/lib/primitives/result/results";

import { GITLAB_API_ORIGIN } from "./constants";
import { listEnabledGitLabConnections } from "./connections";
import { loadGitLabCloneCredentials } from "./credentials";
import { getGitLabMergeRequest, getGitLabProject, listGitLabMembershipProjects } from "./client";
import { resolveGitLabPipesWorkosUserId } from "./pipes";
import type { GitLabApiError, GitLabProject, ListedGitLabProject } from "./types";

export type GitLabContextResolution =
  | { status: "not_applicable" }
  | { status: "resolved"; context: RepositoryAgentGitLabContext }
  | { status: "unresolved"; followUp: string };

function toListedProject(input: {
  project: GitLabProject;
  instanceOrigin: string;
  connectionId: string | null;
}): ListedGitLabProject {
  return {
    ...input.project,
    instanceOrigin: input.instanceOrigin,
    connectionId: input.connectionId,
  };
}

function toGitLabContext(input: {
  project: GitLabProject;
  instanceOrigin: string;
  connectionId?: string | null;
  mergeRequestIid?: number;
  branch?: string;
  commitSha?: string;
}): RepositoryAgentGitLabContext {
  return {
    resolved: true,
    provider: "gitlab",
    projectId: input.project.id,
    repositoryFullName: input.project.pathWithNamespace,
    httpUrlToRepo: input.project.httpUrlToRepo,
    instanceOrigin: input.instanceOrigin,
    ...(input.connectionId ? { connectionId: input.connectionId } : {}),
    ...(input.mergeRequestIid === undefined ? {} : { mergeRequestIid: input.mergeRequestIid }),
    ...(input.branch ? { branch: input.branch } : {}),
    ...(input.commitSha ? { commitSha: input.commitSha } : {}),
  };
}

export async function listAccessibleGitLabProjects(input: {
  localOrganizationId: string;
  workosUserId: string;
  signal?: AbortSignal;
}): Promise<{ projects: ListedGitLabProject[]; error: GitLabApiError | null }> {
  const projects: ListedGitLabProject[] = [];
  let pipesError: GitLabApiError | null = null;

  const pipesCredentials = await loadGitLabCloneCredentials({
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(pipesCredentials)) {
    if (pipesCredentials.error.code !== "gitlab_not_connected") {
      pipesError = pipesCredentials.error;
    }
  } else {
    const projectsResult = await listGitLabMembershipProjects({
      accessToken: pipesCredentials.value.accessToken,
      apiOrigin: pipesCredentials.value.apiOrigin,
      signal: input.signal,
    });
    if (isErr(projectsResult)) {
      pipesError = projectsResult.error;
    } else {
      for (const project of projectsResult.value) {
        projects.push(
          toListedProject({
            project,
            instanceOrigin: GITLAB_API_ORIGIN,
            connectionId: null,
          }),
        );
      }
    }
  }

  const connections = await listEnabledGitLabConnections({
    organizationId: input.localOrganizationId,
  });
  for (const connection of connections) {
    const credential = await loadGitLabCloneCredentials({
      localOrganizationId: input.localOrganizationId,
      connectionId: connection.id,
    });
    if (isErr(credential)) {
      continue;
    }

    const projectsResult = await listGitLabMembershipProjects({
      accessToken: credential.value.accessToken,
      apiOrigin: credential.value.apiOrigin,
      signal: input.signal,
    });
    if (isErr(projectsResult)) {
      continue;
    }

    for (const project of projectsResult.value) {
      projects.push(
        toListedProject({
          project,
          instanceOrigin: connection.baseUrl,
          connectionId: connection.id,
        }),
      );
    }
  }

  if (projects.length > 0) {
    return { projects, error: null };
  }

  return { projects, error: pipesError };
}

export async function resolveGitLabProjectContext(input: {
  localOrganizationId: string;
  workosUserId?: string | null;
  pathWithNamespace: string;
  connectionId?: string | null;
  instanceOrigin?: string | null;
  mergeRequestIid?: number;
  signal?: AbortSignal;
}): Promise<RepositoryAgentGitLabContext | null> {
  const pathWithNamespace = normalizeGitLabPathWithNamespace(input.pathWithNamespace);
  if (!pathWithNamespace) {
    return null;
  }

  const credentialResult = await loadGitLabCloneCredentials({
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
    connectionId: input.connectionId,
  });
  if (isErr(credentialResult)) {
    return null;
  }

  const apiOrigin = input.instanceOrigin?.trim() || credentialResult.value.apiOrigin;
  const projectResult = await getGitLabProject({
    accessToken: credentialResult.value.accessToken,
    pathWithNamespace,
    apiOrigin,
    signal: input.signal,
  });
  if (isErr(projectResult)) {
    return null;
  }

  const project = projectResult.value;
  if (input.mergeRequestIid === undefined) {
    return toGitLabContext({
      project,
      instanceOrigin: apiOrigin,
      connectionId: credentialResult.value.connectionId,
      branch: project.defaultBranch ?? undefined,
    });
  }

  const mergeRequestResult = await getGitLabMergeRequest({
    accessToken: credentialResult.value.accessToken,
    pathWithNamespace: project.pathWithNamespace,
    mergeRequestIid: input.mergeRequestIid,
    apiOrigin,
    signal: input.signal,
  });
  if (isErr(mergeRequestResult)) {
    return null;
  }

  return toGitLabContext({
    project,
    instanceOrigin: apiOrigin,
    connectionId: credentialResult.value.connectionId,
    mergeRequestIid: input.mergeRequestIid,
    branch: mergeRequestResult.value.sourceBranch ?? project.defaultBranch ?? undefined,
    commitSha: mergeRequestResult.value.commitSha ?? undefined,
  });
}

async function allowedGitLabOrigins(organizationId: string): Promise<
  { origin: string; connectionId: string | null }[]
> {
  const connections = await listEnabledGitLabConnections({ organizationId });
  return [
    { origin: GITLAB_API_ORIGIN, connectionId: null },
    ...connections.map((connection) => ({
      origin: connection.baseUrl,
      connectionId: connection.id,
    })),
  ];
}

function connectionIdForOrigin(
  origin: string,
  origins: { origin: string; connectionId: string | null }[],
): string | null {
  const match = origins.find(
    (entry) => entry.origin.toLowerCase() === origin.toLowerCase(),
  );
  return match?.connectionId ?? null;
}

export async function resolveConversationRepositoryGitLabContext(input: {
  organizationId: string;
  localUserId?: string | null;
  workosUserId?: string | null;
  text: string;
}): Promise<GitLabContextResolution> {
  const workosUserId = await resolveGitLabPipesWorkosUserId({
    workosUserId: input.workosUserId,
    localUserId: input.localUserId,
  });
  const origins = await allowedGitLabOrigins(input.organizationId);
  const originValues = origins.map((entry) => entry.origin);

  const mergeRequests = extractGitLabMergeRequestReferences(input.text, originValues);
  if (mergeRequests.length > 1) {
    return {
      status: "unresolved",
      followUp:
        "I found more than one GitLab merge request link. Please send one MR URL so I know which project to clone.",
    };
  }

  if (mergeRequests.length === 1) {
    const reference = mergeRequests[0]!;
    const context = await resolveGitLabProjectContext({
      localOrganizationId: input.organizationId,
      workosUserId,
      pathWithNamespace: reference.pathWithNamespace,
      connectionId: connectionIdForOrigin(reference.origin, origins),
      instanceOrigin: reference.origin,
      mergeRequestIid: reference.mergeRequestIid,
    });
    if (!context) {
      return {
        status: "unresolved",
        followUp:
          "I found a GitLab merge request, but I can't access that project with the connected GitLab account. Connect GitLab in Integrations and try again.",
      };
    }
    return { status: "resolved", context };
  }

  const projectReferences = extractGitLabProjectReferences(input.text, originValues);
  if (projectReferences.length > 1) {
    return {
      status: "unresolved",
      followUp:
        "I found more than one GitLab project. Please send one GitLab URL so I know which repository to clone.",
    };
  }

  if (projectReferences.length === 1) {
    const reference = projectReferences[0]!;
    const context = await resolveGitLabProjectContext({
      localOrganizationId: input.organizationId,
      workosUserId,
      pathWithNamespace: reference.pathWithNamespace,
      connectionId: connectionIdForOrigin(reference.origin, origins),
      instanceOrigin: reference.origin,
    });
    if (!context) {
      return {
        status: "unresolved",
        followUp:
          "I found a GitLab project URL, but I can't access that project with the connected GitLab account. Connect GitLab in Integrations and try again.",
      };
    }
    return { status: "resolved", context };
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
    context.instanceOrigin ? `- instance: ${context.instanceOrigin}` : null,
    context.mergeRequestIid === undefined ? null : `- mergeRequestIid: ${context.mergeRequestIid}`,
    context.branch ? `- branch: ${context.branch}` : null,
    context.commitSha ? `- commitSha: ${context.commitSha}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
