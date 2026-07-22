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
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client-instance";

import { createTeamsApi, type TeamSummaryRow } from "./teams-api";
import { toCreateTeamPayload, toUpdateTeamPayload } from "./team-form";
import { TeamsPageView } from "./teams-page-view";
import { teamsPageContentMessages } from "./teams-page-content.messages";

const teamsApi = createTeamsApi(apiClient);

function teamsQueryKey(organizationSlug: string) {
  return ["workspace-teams", organizationSlug] as const;
}

export function TeamsPageContent({
  organizationSlug,
  canManageTeams,
  teamsApi: injectedTeamsApi = teamsApi,
}: {
  organizationSlug: string;
  canManageTeams: boolean;
  teamsApi?: typeof teamsApi;
}) {
  const intl = useIntl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamSummaryRow | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<TeamSummaryRow | null>(null);

  const teamsQuery = useQuery({
    queryKey: teamsQueryKey(organizationSlug),
    queryFn: () => injectedTeamsApi.listTeams(organizationSlug),
  });

  const invalidateTeams = async () => {
    await queryClient.invalidateQueries({ queryKey: teamsQueryKey(organizationSlug) });
  };

  const createTeam = useMutation({
    mutationFn: (values: { name: string; slug: string }) =>
      injectedTeamsApi.createTeam(organizationSlug, toCreateTeamPayload(values)),
    onSuccess: async (team) => {
      setIsCreateOpen(false);
      await invalidateTeams();
      toast.success(intl.formatMessage(teamsPageContentMessages.teamCreated));
      router.push(`/org/${organizationSlug}/teams/${team.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateTeam = useMutation({
    mutationFn: (values: { name: string; slug: string }) => {
      if (!editingTeam) {
        throw new Error("No team selected for update.");
      }

      return injectedTeamsApi.updateTeam(
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
      toast.error(error.message);
    },
  });

  const deleteTeam = useMutation({
    mutationFn: () => {
      if (!deletingTeam) {
        throw new Error("No team selected for deletion.");
      }

      return injectedTeamsApi.deleteTeam(organizationSlug, deletingTeam.id);
    },
    onSuccess: async () => {
      setDeletingTeam(null);
      await invalidateTeams();
      toast.success(intl.formatMessage(teamsPageContentMessages.teamDeleted));
    },
    onError: (error) => {
      toast.error(error.message);
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
