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
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { hasCapability } from "@/api/auth/policy";
import { createTeamsApi } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/teams/_components/teams-api";
import { apiClient } from "@/lib/api-client-instance";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { DEFAULT_WORKSPACE_TEAM_SLUG } from "@/lib/teams/default-workspace-team-constants";

import { membersPageContentMessages } from "./members-page-content.messages";
import { MembersPageView } from "./members-page-view";
import {
  resolveMembersPageState,
  type MembersListMember,
  type MembersListResponse,
} from "./members-settings-view-model";

const membersQueryKey = (organizationSlug: string) => ["workspace-members", organizationSlug];
const teamsQueryKey = (organizationSlug: string) => ["workspace-teams", organizationSlug];
const teamsApi = createTeamsApi(apiClient);

function resolveDefaultTeamId(teams: { id: string; slug: string }[]) {
  return teams.find((team) => team.slug === DEFAULT_WORKSPACE_TEAM_SLUG)?.id ?? teams[0]?.id ?? "";
}

async function readMemberError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);

  if (body && typeof body === "object" && "message" in body && body.message) {
    return String(body.message);
  }

  if (body && typeof body === "object" && "error" in body) {
    return String(body.error);
  }

  return fallback;
}

export function MembersPageContent({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationMembershipRole>("member");
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [removingMember, setRemovingMember] = useState<MembersListMember | null>(null);
  const [editingMember, setEditingMember] = useState<MembersListMember | null>(null);

  const teamsQuery = useQuery({
    queryKey: teamsQueryKey(organizationSlug),
    queryFn: () => teamsApi.listTeams(organizationSlug),
  });

  const membersQuery = useQuery({
    queryKey: membersQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].members.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(
          await readMemberError(
            response,
            intl.formatMessage(membersPageContentMessages.loadFailed),
          ),
        );
      }
      return (await response.json()) as MembersListResponse;
    },
  });

  const pageState = resolveMembersPageState(membersQuery.data, intl);
  const { members, assignableRoles, canInvite } = pageState;
  const inviteTeams = teamsQuery.data ?? [];
  const defaultInviteTeamId = resolveDefaultTeamId(inviteTeams);
  const inviteRequiresTeam = !hasCapability(inviteRole, "teams:write");

  useEffect(() => {
    if (!isInviteOpen || inviteTeams.length === 0) {
      return;
    }

    setInviteTeamId((currentTeamId) => {
      if (currentTeamId && inviteTeams.some((team) => team.id === currentTeamId)) {
        return currentTeamId;
      }

      return defaultInviteTeamId;
    });
  }, [defaultInviteTeamId, inviteTeams, isInviteOpen]);

  const inviteMember = useMutation({
    mutationFn: async (input: {
      email: string;
      role: OrganizationMembershipRole;
      teamId?: string;
    }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].members.$post({
        param: { organizationSlug },
        json: input,
      });
      if (!response.ok) {
        throw new Error(
          await readMemberError(
            response,
            intl.formatMessage(membersPageContentMessages.inviteFailed),
          ),
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      setInviteEmail("");
      setInviteRole("member");
      setInviteTeamId(defaultInviteTeamId);
      setIsInviteOpen(false);
      await queryClient.invalidateQueries({ queryKey: membersQueryKey(organizationSlug) });
      toast.success(intl.formatMessage(membersPageContentMessages.invitationSentToast));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateRole = useMutation({
    mutationFn: async (input: { workosUserId: string; role: OrganizationMembershipRole }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].members[
        ":workosUserId"
      ].$patch({
        param: { organizationSlug, workosUserId: input.workosUserId },
        json: { role: input.role },
      });
      if (!response.ok) {
        throw new Error(
          await readMemberError(
            response,
            intl.formatMessage(membersPageContentMessages.updateRoleFailed),
          ),
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      setEditingMember(null);
      await queryClient.invalidateQueries({ queryKey: membersQueryKey(organizationSlug) });
      toast.success(intl.formatMessage(membersPageContentMessages.roleUpdatedToast));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const removeMember = useMutation({
    mutationFn: async (workosUserId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].members[
        ":workosUserId"
      ].$delete({
        param: { organizationSlug, workosUserId },
      });
      if (response.status !== 204 && !response.ok) {
        throw new Error(
          await readMemberError(
            response,
            intl.formatMessage(membersPageContentMessages.removeFailed),
          ),
        );
      }
    },
    onSuccess: async () => {
      const wasInvited = removingMember?.status === "invited";
      setRemovingMember(null);
      await queryClient.invalidateQueries({ queryKey: membersQueryKey(organizationSlug) });
      toast.success(
        intl.formatMessage(
          wasInvited
            ? membersPageContentMessages.invitationRevokedToast
            : membersPageContentMessages.memberRemovedToast,
        ),
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  function handleInviteSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      return;
    }

    inviteMember.mutate({
      email: inviteEmail.trim(),
      role: inviteRole,
      ...(inviteRequiresTeam && inviteTeamId ? { teamId: inviteTeamId } : {}),
    });
  }

  function handleInviteOpenChange(open: boolean) {
    setIsInviteOpen(open);
    if (open && defaultInviteTeamId) {
      setInviteTeamId(defaultInviteTeamId);
    }
  }

  return (
    <MembersPageView
      organizationSlug={organizationSlug}
      members={members}
      assignableRoles={assignableRoles}
      canInvite={canInvite}
      isLoading={membersQuery.isLoading}
      loadError={
        membersQuery.isError
          ? membersQuery.error instanceof Error
            ? membersQuery.error.message
            : intl.formatMessage(membersPageContentMessages.loadErrorFallback)
          : null
      }
      isInviteOpen={isInviteOpen}
      inviteEmail={inviteEmail}
      inviteRole={inviteRole}
      inviteTeams={inviteTeams}
      inviteTeamId={inviteTeamId}
      inviteRequiresTeam={inviteRequiresTeam}
      isLoadingTeams={teamsQuery.isLoading}
      teamsLoadError={
        teamsQuery.isError
          ? teamsQuery.error instanceof Error
            ? teamsQuery.error.message
            : intl.formatMessage(membersPageContentMessages.teamsLoadFailed)
          : null
      }
      isInviting={inviteMember.isPending}
      removingMember={removingMember}
      isRemoving={removeMember.isPending}
      editingMember={editingMember}
      isUpdatingRole={updateRole.isPending}
      onInviteOpenChange={handleInviteOpenChange}
      onInviteEmailChange={setInviteEmail}
      onInviteRoleChange={setInviteRole}
      onInviteTeamIdChange={setInviteTeamId}
      onInviteSubmit={handleInviteSubmit}
      onRemovingMemberChange={setRemovingMember}
      onRemoveMember={(workosUserId) => removeMember.mutate(workosUserId)}
      onEditingMemberChange={setEditingMember}
      onUpdateRole={(input) => updateRole.mutate(input)}
    />
  );
}
