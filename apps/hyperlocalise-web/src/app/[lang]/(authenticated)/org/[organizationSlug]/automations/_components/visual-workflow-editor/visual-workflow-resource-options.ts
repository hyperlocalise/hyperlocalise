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
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import type { ContentSyncProvider } from "@/lib/agents/content-sync/content-sync-types";
import { createVisualWorkflowsApi } from "../visual-workflows-api";

const api = createApiClient();
const visualWorkflowsApi = createVisualWorkflowsApi();

export type VisualWorkflowProjectOption = {
  id: string;
  name: string;
};

export type VisualWorkflowMemberOption = {
  userId?: string;
  workosUserId: string;
  label: string;
};

export type VisualWorkflowTeamOption = {
  id: string;
  label: string;
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
  const { client: goSvcClient, loading: accessTokenLoading } = useGoSvcClient();

  const projectsQuery = useQuery({
    queryKey: ["projects", organizationSlug],
    enabled: enabled && !accessTokenLoading,
    queryFn: async () => {
      const body = await goSvcClient.project.list(organizationSlug!);
      return (body.projects ?? []) as VisualWorkflowProjectOption[];
    },
  });

  const membersQuery = useQuery({
    queryKey: ["org-members", organizationSlug, "visual-workflow"],
    enabled: enabled && !accessTokenLoading,
    queryFn: async (): Promise<VisualWorkflowMemberOption[]> => {
      const body = await goSvcClient.member.list(organizationSlug!);
      return body.members
        .filter((member) => member.status === "active")
        .map((member) => ({
          userId: member.userId,
          workosUserId: member.workosUserId,
          label: member.displayName || member.email,
        }));
    },
  });

  const teamsQuery = useQuery({
    queryKey: ["org-teams", organizationSlug, "visual-workflow"],
    enabled: enabled && !accessTokenLoading,
    queryFn: async (): Promise<VisualWorkflowTeamOption[]> => {
      const body = await goSvcClient.team.list(organizationSlug!);
      return body.teams.map((team) => ({ id: team.id, label: team.name }));
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

  const workflowsQuery = useQuery({
    queryKey: ["visual-workflows", organizationSlug, "call-options"],
    enabled,
    queryFn: () => visualWorkflowsApi.listVisualWorkflows(organizationSlug!),
  });

  const githubConnected = Boolean(githubQuery.data);
  const repositories = (repositoriesQuery.data ?? []).filter(
    (repository) => repository.enabled && !repository.archived,
  );
  const contentfulConnections = contentfulQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

  return {
    projects,
    members: membersQuery.data ?? [],
    teams: teamsQuery.data ?? [],
    repositories,
    contentfulConnections,
    workflows: (workflowsQuery.data ?? []).filter(
      (workflow) => workflow.publishedVersion !== null && workflow.publishedDefinition !== null,
    ),
    githubConnected,
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
