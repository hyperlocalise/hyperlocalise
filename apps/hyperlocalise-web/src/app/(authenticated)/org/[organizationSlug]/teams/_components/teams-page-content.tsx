"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client-instance";

import { createTeamsApi } from "./teams-api";
import { toCreateTeamPayload } from "./team-form";
import { TeamsPageView } from "./teams-page-view";

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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const teamsQuery = useQuery({
    queryKey: teamsQueryKey(organizationSlug),
    queryFn: () => injectedTeamsApi.listTeams(organizationSlug),
  });

  const createTeam = useMutation({
    mutationFn: (values: { name: string; slug: string }) =>
      injectedTeamsApi.createTeam(organizationSlug, toCreateTeamPayload(values)),
    onSuccess: async (team) => {
      setIsCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: teamsQueryKey(organizationSlug) });
      toast.success("Team created");
      router.push(`/org/${organizationSlug}/teams/${team.id}`);
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
      onCreateOpenChange={setIsCreateOpen}
      onCreateTeam={(values) => createTeam.mutate(values)}
    />
  );
}
