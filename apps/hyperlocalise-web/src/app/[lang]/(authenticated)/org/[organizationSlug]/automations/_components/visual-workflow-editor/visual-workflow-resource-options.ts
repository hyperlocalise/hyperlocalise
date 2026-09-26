"use client";

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
import { useQuery } from "@tanstack/react-query";

import { createApiClient } from "@/lib/api-client";
import type { ContentSyncProvider } from "@/lib/agents/content-sync/content-sync-types";

const api = createApiClient();

export type VisualWorkflowProjectOption = {
  id: string;
  name: string;
};

export type VisualWorkflowGithubRepositoryOption = {
  id: string;
  fullName: string;
  enabled: boolean;
  archived: boolean;
};

export type VisualWorkflowContentfulConnectionOption = {
  id: string;
  displayName: string;
  spaceId: string;
};

export type VisualWorkflowResourceOption = {
  id: string;
  label: string;
  resourceKey: string;
};

export function useVisualWorkflowResourceOptions(organizationSlug?: string) {
  const enabled = Boolean(organizationSlug);

  const projectsQuery = useQuery({
    queryKey: ["projects", organizationSlug],
    enabled,
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug: organizationSlug! },
      });
      if (response.status !== 200) {
        return [] as VisualWorkflowProjectOption[];
      }
      return ((await response.json()).projects ?? []) as VisualWorkflowProjectOption[];
    },
  });

  const githubQuery = useQuery({
    queryKey: ["github-installation", organizationSlug],
    enabled,
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["github-installation"].$get({
        param: { organizationSlug: organizationSlug! },
      });
      if (!response.ok) {
        throw new Error("Failed to load GitHub installation");
      }
      return (await response.json()).installation as { githubInstallationId: string } | null;
    },
  });

  const repositoriesQuery = useQuery({
    queryKey: ["github-installation-repositories", organizationSlug],
    enabled: enabled && Boolean(githubQuery.data),
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"][
        "github-installation"
      ].repositories.$get({
        param: { organizationSlug: organizationSlug! },
        query: {},
      });
      if (!response.ok) {
        return [] as VisualWorkflowGithubRepositoryOption[];
      }
      return ((await response.json()).repositories ?? []) as VisualWorkflowGithubRepositoryOption[];
    },
  });

  const contentfulQuery = useQuery({
    queryKey: ["contentful-connections", organizationSlug],
    enabled,
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["contentful-connections"].$get({
        param: { organizationSlug: organizationSlug! },
      });
      if (!response.ok) {
        return [] as VisualWorkflowContentfulConnectionOption[];
      }
      return ((await response.json()).contentfulConnections ??
        []) as VisualWorkflowContentfulConnectionOption[];
    },
  });

  const githubConnected = Boolean(githubQuery.data);
  const repositories = (repositoriesQuery.data ?? []).filter(
    (repository) => repository.enabled && !repository.archived,
  );
  const contentfulConnections = contentfulQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

  return {
    projects,
    repositories,
    contentfulConnections,
    githubConnected,
    availableProviders: [
      ...(githubConnected ? (["github"] as const) : []),
      ...(contentfulConnections.length > 0 ? (["contentful"] as const) : []),
    ] satisfies ContentSyncProvider[],
    resourceOptionsFor(provider: ContentSyncProvider): VisualWorkflowResourceOption[] {
      if (provider === "github") {
        return repositories.map((repository) => ({
          id: repository.id,
          label: repository.fullName,
          resourceKey: repository.fullName,
        }));
      }
      if (provider === "contentful") {
        return contentfulConnections.map((connection) => ({
          id: connection.id,
          label: connection.displayName || connection.spaceId,
          resourceKey: connection.spaceId,
        }));
      }
      return [];
    },
  };
}
