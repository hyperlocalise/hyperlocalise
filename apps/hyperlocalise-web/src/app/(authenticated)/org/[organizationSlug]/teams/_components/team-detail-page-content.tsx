"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { TeamRole } from "@/api/routes/team/team.schema";
import { apiClient } from "@/lib/api-client-instance";

import { createTeamsApi, type TeamMemberRow } from "./teams-api";
import { toUpdateTeamPayload } from "./team-form";
import { TeamDetailPageView } from "./team-detail-page-view";

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
      toast.success("Team updated");
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
      toast.success("Member added to team");
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
      toast.success("Team role updated");
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
      toast.success("Member removed from team");
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
      isUpdatingRole={updateMemberRole.isPending}
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
