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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import type { TeamRole } from "@/api/routes/team/team.schema";
import { apiClient } from "@/lib/api-client-instance";

import { createTeamsApi, type TeamMemberRow } from "./teams-api";
import { toUpdateTeamPayload } from "./team-form";
import { TeamDetailPageView } from "./team-detail-page-view";
import { teamDetailPageContentMessages } from "./team-detail-page-content.messages";

const teamsApi = createTeamsApi(apiClient);

function teamQueryKey(organizationSlug: string, teamId: string) {
  return ["workspace-team", organizationSlug, teamId] as const;
}

function memberDirectoryQueryKey(organizationSlug: string) {
  return ["workspace-team-member-directory", organizationSlug] as const;
}

export function TeamDetailPageContent({
  organizationSlug,
  teamId,
  canManageTeams,
  currentUserWorkosId,
  teamsApi: injectedTeamsApi = teamsApi,
}: {
  organizationSlug: string;
  teamId: string;
  canManageTeams: boolean;
  currentUserWorkosId: string;
  teamsApi?: typeof teamsApi;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [removingMember, setRemovingMember] = useState<TeamMemberRow | null>(null);

  const teamQuery = useQuery({
    queryKey: teamQueryKey(organizationSlug, teamId),
    queryFn: () => injectedTeamsApi.getTeam(organizationSlug, teamId),
  });

  const memberDirectoryQuery = useQuery({
    queryKey: memberDirectoryQueryKey(organizationSlug),
    queryFn: () => injectedTeamsApi.listMemberDirectory(organizationSlug),
    enabled: isAddMemberOpen,
  });

  const invalidateTeam = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: teamQueryKey(organizationSlug, teamId) }),
      queryClient.invalidateQueries({ queryKey: ["workspace-teams", organizationSlug] }),
    ]);
  };

  const updateTeam = useMutation({
    mutationFn: (values: { name: string; slug: string }) =>
      injectedTeamsApi.updateTeam(organizationSlug, teamId, toUpdateTeamPayload(values)),
    onSuccess: async () => {
      setIsEditOpen(false);
      await invalidateTeam();
      toast.success(intl.formatMessage(teamDetailPageContentMessages.teamUpdated));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const addMember = useMutation({
    mutationFn: (input: { workosUserId: string; role: TeamRole }) =>
      injectedTeamsApi.addTeamMember(organizationSlug, teamId, input),
    onSuccess: async () => {
      setIsAddMemberOpen(false);
      await invalidateTeam();
      toast.success(intl.formatMessage(teamDetailPageContentMessages.memberAdded));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMemberRole = useMutation({
    mutationFn: (input: { workosUserId: string; role: TeamRole }) =>
      injectedTeamsApi.addTeamMember(organizationSlug, teamId, input),
    onSuccess: async () => {
      await invalidateTeam();
      toast.success(intl.formatMessage(teamDetailPageContentMessages.roleUpdated));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const removeMember = useMutation({
    mutationFn: (workosUserId: string) =>
      injectedTeamsApi.removeTeamMember(organizationSlug, teamId, workosUserId),
    onSuccess: async () => {
      setRemovingMember(null);
      await invalidateTeam();
      toast.success(intl.formatMessage(teamDetailPageContentMessages.memberRemoved));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <TeamDetailPageView
      organizationSlug={organizationSlug}
      team={teamQuery.data}
      canManageTeams={canManageTeams}
      currentUserWorkosId={currentUserWorkosId}
      memberDirectory={memberDirectoryQuery.data ?? []}
      isLoading={teamQuery.isLoading}
      error={teamQuery.error}
      isAddMemberOpen={isAddMemberOpen}
      isAddingMember={addMember.isPending}
      isEditOpen={isEditOpen}
      isSavingTeam={updateTeam.isPending}
      isRemovingMember={removeMember.isPending}
      updatingMemberRoleId={
        updateMemberRole.isPending ? (updateMemberRole.variables?.workosUserId ?? null) : null
      }
      removingMember={removingMember}
      onAddMemberOpenChange={setIsAddMemberOpen}
      onEditOpenChange={setIsEditOpen}
      onAddMember={(input) => addMember.mutate(input)}
      onUpdateTeam={(values) => updateTeam.mutate(values)}
      onUpdateMemberRole={(input) => updateMemberRole.mutate(input)}
      onRemoveMember={(workosUserId) => removeMember.mutate(workosUserId)}
      onRemovingMemberChange={setRemovingMember}
    />
  );
}
