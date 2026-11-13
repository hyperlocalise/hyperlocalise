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
import { useMemo, useState } from "react";
import { useOrgRouter } from "@/lib/navigation/use-org-router";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { createTeamsApi, type TeamsApi, type TeamSummaryRow } from "./teams-api";
import { toCreateTeamPayload, toUpdateTeamPayload } from "./team-form";
import { TeamsPageView } from "./teams-page-view";
import { teamsPageContentMessages } from "./teams-page-content.messages";

function teamsQueryKey(organizationSlug: string) {
  return ["workspace-teams", organizationSlug] as const;
}

export function TeamsPageContent({
  organizationSlug,
  canManageTeams,
  teamsApi: injectedTeamsApi,
}: {
  organizationSlug: string;
  canManageTeams: boolean;
  teamsApi?: TeamsApi;
}) {
  const intl = useIntl();
  const router = useOrgRouter();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const defaultTeamsApi = useMemo(() => createTeamsApi(goSvcClient), [goSvcClient]);
  const activeTeamsApi = injectedTeamsApi ?? defaultTeamsApi;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamSummaryRow | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<TeamSummaryRow | null>(null);

  const teamsQuery = useQuery({
    queryKey: teamsQueryKey(organizationSlug),
    queryFn: async () => {
      try {
        return await activeTeamsApi.listTeams(organizationSlug);
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(teamsPageContentMessages.loadFailed)),
          { cause: error },
        );
      }
    },
  });

  const invalidateTeams = async () => {
    await queryClient.invalidateQueries({ queryKey: teamsQueryKey(organizationSlug) });
  };

  const createTeam = useMutation({
    mutationFn: (values: { name: string; slug: string }) =>
      activeTeamsApi.createTeam(organizationSlug, toCreateTeamPayload(values)),
    onSuccess: async (team) => {
      setIsCreateOpen(false);
      await invalidateTeams();
      toast.success(intl.formatMessage(teamsPageContentMessages.teamCreated));
      router.push(`/org/${organizationSlug}/teams/${team.id}`);
    },
    onError: (error) => {
      toast.error(
        goSvcErrorMessage(error, intl.formatMessage(teamsPageContentMessages.createFailed)),
      );
    },
  });

  const updateTeam = useMutation({
    mutationFn: (values: { name: string; slug: string }) => {
      if (!editingTeam) {
        throw new Error("No team selected for update.");
      }

      return activeTeamsApi.updateTeam(
        organizationSlug,
        editingTeam.id,
        toUpdateTeamPayload(values),
      );
    },
    onSuccess: async () => {
      setEditingTeam(null);
      await invalidateTeams();
      toast.success(intl.formatMessage(teamsPageContentMessages.teamUpdated));
    },
    onError: (error) => {
      toast.error(
        goSvcErrorMessage(error, intl.formatMessage(teamsPageContentMessages.updateFailed)),
      );
    },
  });

  const deleteTeam = useMutation({
    mutationFn: () => {
      if (!deletingTeam) {
        throw new Error("No team selected for deletion.");
      }

      return activeTeamsApi.deleteTeam(organizationSlug, deletingTeam.id);
    },
    onSuccess: async () => {
      setDeletingTeam(null);
      await invalidateTeams();
      toast.success(intl.formatMessage(teamsPageContentMessages.teamDeleted));
    },
    onError: (error) => {
      toast.error(
        goSvcErrorMessage(error, intl.formatMessage(teamsPageContentMessages.deleteFailed)),
      );
    },
  });

  return (
    <TeamsPageView
      organizationSlug={organizationSlug}
      teams={teamsQuery.data ?? []}
      canManageTeams={canManageTeams}
      isLoading={teamsQuery.isLoading}
      error={teamsQuery.error}
      isCreateOpen={isCreateOpen}
      isCreating={createTeam.isPending}
      editingTeam={editingTeam}
      isUpdatingTeam={updateTeam.isPending}
      deletingTeam={deletingTeam}
      isDeletingTeam={deleteTeam.isPending}
      onCreateOpenChange={setIsCreateOpen}
      onCreateTeam={(values) => createTeam.mutate(values)}
      onEditingTeamChange={setEditingTeam}
      onUpdateTeam={(values) => updateTeam.mutate(values)}
      onDeletingTeamChange={setDeletingTeam}
      onDeleteTeam={() => deleteTeam.mutate()}
    />
  );
}
