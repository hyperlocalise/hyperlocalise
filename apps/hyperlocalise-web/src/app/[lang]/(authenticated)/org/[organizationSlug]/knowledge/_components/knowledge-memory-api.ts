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
import { apiClient } from "@/lib/api-client-instance";

export type KnowledgeMemoryClientScope = {
  organizationSlug: string;
  projectId?: string;
};

export function knowledgeMemoryQueryKey(organizationSlug: string, projectId?: string) {
  return projectId
    ? (["knowledge-memory", organizationSlug, projectId] as const)
    : (["knowledge-memory", organizationSlug] as const);
}

export function knowledgeMemoryRevisionQueryKey(organizationSlug: string, projectId?: string) {
  return projectId
    ? (["knowledge-memory-revisions", organizationSlug, projectId] as const)
    : (["knowledge-memory-revisions", organizationSlug] as const);
}

function workspaceKnowledgeMemory() {
  return apiClient.api.orgs[":organizationSlug"]["knowledge-memory"];
}

function projectKnowledgeMemory() {
  return apiClient.api.orgs[":organizationSlug"].projects[":projectId"]["knowledge-memory"];
}

export function getKnowledgeMemory(scope: KnowledgeMemoryClientScope) {
  if (scope.projectId) {
    return projectKnowledgeMemory().$get({
      param: { organizationSlug: scope.organizationSlug, projectId: scope.projectId },
    });
  }

  return workspaceKnowledgeMemory().$get({
    param: { organizationSlug: scope.organizationSlug },
  });
}

export function putKnowledgeMemory(
  scope: KnowledgeMemoryClientScope,
  input: { content: string; summary?: string },
  headers: { "If-Match": string },
) {
  if (scope.projectId) {
    return projectKnowledgeMemory().$put(
      {
        param: { organizationSlug: scope.organizationSlug, projectId: scope.projectId },
        json: input,
      },
      { headers },
    );
  }

  return workspaceKnowledgeMemory().$put(
    {
      param: { organizationSlug: scope.organizationSlug },
      json: input,
    },
    { headers },
  );
}

export function listKnowledgeMemoryRevisions(
  scope: KnowledgeMemoryClientScope,
  query: { limit: string; cursor?: number },
) {
  if (scope.projectId) {
    return projectKnowledgeMemory().revisions.$get({
      param: { organizationSlug: scope.organizationSlug, projectId: scope.projectId },
      query,
    });
  }

  return workspaceKnowledgeMemory().revisions.$get({
    param: { organizationSlug: scope.organizationSlug },
    query,
  });
}

export function getKnowledgeMemoryRevision(scope: KnowledgeMemoryClientScope, revisionId: string) {
  if (scope.projectId) {
    return projectKnowledgeMemory().revisions[":revisionId"].$get({
      param: {
        organizationSlug: scope.organizationSlug,
        projectId: scope.projectId,
        revisionId,
      },
    });
  }

  return workspaceKnowledgeMemory().revisions[":revisionId"].$get({
    param: { organizationSlug: scope.organizationSlug, revisionId },
  });
}

export function restoreKnowledgeMemoryRevision(
  scope: KnowledgeMemoryClientScope,
  revisionId: string,
  headers: { "If-Match": string },
) {
  if (scope.projectId) {
    return projectKnowledgeMemory().revisions[":revisionId"].restore.$post(
      {
        param: {
          organizationSlug: scope.organizationSlug,
          projectId: scope.projectId,
          revisionId,
        },
      },
      { headers },
    );
  }

  return workspaceKnowledgeMemory().revisions[":revisionId"].restore.$post(
    {
      param: { organizationSlug: scope.organizationSlug, revisionId },
    },
    { headers },
  );
}
