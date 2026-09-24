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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import type { TeamRole } from "@/lib/teams/team.schema";
import { createTeamsApi, type TeamMemberRow, type TeamsApi } from "./teams-api";
import { toUpdateTeamPayload } from "./team-form";
import { TeamDetailPageView } from "./team-detail-page-view";
import { teamDetailPageContentMessages } from "./team-detail-page-content.messages";

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
  teamsApi: injectedTeamsApi,
}: {
  organizationSlug: string;
  teamId: string;
  canManageTeams: boolean;
  currentUserWorkosId: string;
  teamsApi?: TeamsApi;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const defaultTeamsApi = useMemo(() => createTeamsApi(goSvcClient), [goSvcClient]);
  const activeTeamsApi = injectedTeamsApi ?? defaultTeamsApi;
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMemberRow | null>(null);
  const [removingMember, setRemovingMember] = useState<TeamMemberRow | null>(null);

  const teamQuery = useQuery({
    queryKey: teamQueryKey(organizationSlug, teamId),
    queryFn: async () => {
      try {
        return await activeTeamsApi.getTeam(organizationSlug, teamId);
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(teamDetailPageContentMessages.loadFailed)),
          { cause: error },
        );
      }
    },
  });

  const memberDirectoryQuery = useQuery({
    queryKey: memberDirectoryQueryKey(organizationSlug),
    queryFn: async () => {
      try {
        return await activeTeamsApi.listMemberDirectory(organizationSlug);
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(teamDetailPageContentMessages.loadFailed)),
          { cause: error },
        );
      }
    },
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
      activeTeamsApi.updateTeam(organizationSlug, teamId, toUpdateTeamPayload(values)),
    onSuccess: async () => {
      setIsEditOpen(false);
      await invalidateTeam();
      toast.success(intl.formatMessage(teamDetailPageContentMessages.teamUpdated));
    },
    onError: (error) => {
      toast.error(
        goSvcErrorMessage(error, intl.formatMessage(teamDetailPageContentMessages.teamUpdated)),
      );
    },
  });

  const addMember = useMutation({
    mutationFn: (input: { workosUserId: string; role: TeamRole }) =>
      activeTeamsApi.addTeamMember(organizationSlug, teamId, input),
    onSuccess: async () => {
      setIsAddMemberOpen(false);
      await invalidateTeam();
      toast.success(intl.formatMessage(teamDetailPageContentMessages.memberAdded));
    },
    onError: (error) => {
      toast.error(
        goSvcErrorMessage(error, intl.formatMessage(teamDetailPageContentMessages.memberAdded)),
      );
    },
  });

  const updateMemberRole = useMutation({
    mutationFn: (input: { workosUserId: string; role: TeamRole }) =>
      activeTeamsApi.addTeamMember(organizationSlug, teamId, input),
    onSuccess: async () => {
      setEditingMember(null);
      await invalidateTeam();
      toast.success(intl.formatMessage(teamDetailPageContentMessages.roleUpdated));
    },
    onError: (error) => {
      toast.error(
        goSvcErrorMessage(error, intl.formatMessage(teamDetailPageContentMessages.roleUpdated)),
      );
    },
  });

  const removeMember = useMutation({
    mutationFn: (workosUserId: string) =>
      activeTeamsApi.removeTeamMember(organizationSlug, teamId, workosUserId),
    onSuccess: async () => {
      setRemovingMember(null);
      await invalidateTeam();
      toast.success(intl.formatMessage(teamDetailPageContentMessages.memberRemoved));
    },
    onError: (error) => {
      toast.error(
        goSvcErrorMessage(error, intl.formatMessage(teamDetailPageContentMessages.memberRemoved)),
      );
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
      isUpdatingMemberRole={updateMemberRole.isPending}
      editingMember={editingMember}
      removingMember={removingMember}
      onAddMemberOpenChange={setIsAddMemberOpen}
      onEditOpenChange={setIsEditOpen}
      onAddMember={(input) => addMember.mutate(input)}
      onUpdateTeam={(values) => updateTeam.mutate(values)}
      onUpdateMemberRole={(input) => updateMemberRole.mutate(input)}
      onEditingMemberChange={setEditingMember}
      onRemoveMember={(workosUserId) => removeMember.mutate(workosUserId)}
      onRemovingMemberChange={setRemovingMember}
    />
  );
}
