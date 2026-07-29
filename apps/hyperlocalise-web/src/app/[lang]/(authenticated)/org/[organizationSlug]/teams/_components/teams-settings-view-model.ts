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
import type { IntlShape } from "@formatjs/intl";

import type { TeamRole } from "@/api/routes/team/team.schema";
import { resolveMessage } from "@/lib/app-i18n/resolve-message";

import type {
  OrganizationMemberDirectoryEntry,
  TeamDetail,
  TeamMemberRow,
  TeamSummaryRow,
} from "./teams-api";
import { teamsSettingsViewModelMessages } from "./teams-settings-view-model.messages";

export type TeamsSettingsIntl = Pick<IntlShape, "formatMessage">;

const teamRoleLabelMessages = {
  manager: teamsSettingsViewModelMessages.roleManager,
  member: teamsSettingsViewModelMessages.roleMember,
} as const;

const teamRoleDescriptionMessages = {
  manager: teamsSettingsViewModelMessages.roleManagerDescription,
  member: teamsSettingsViewModelMessages.roleMemberDescription,
} as const;

export function getTeamRoleLabel(role: TeamRole, intl?: TeamsSettingsIntl) {
  return resolveMessage(intl, teamRoleLabelMessages[role]);
}

export function getTeamRoleDescription(role: TeamRole, intl?: TeamsSettingsIntl) {
  return resolveMessage(intl, teamRoleDescriptionMessages[role]);
}

export function resolveTeamsListPageState(input: {
  teams: TeamSummaryRow[];
  canManageTeams: boolean;
}) {
  return {
    teams: input.teams,
    canCreateTeam: input.canManageTeams,
    canManageTeams: input.canManageTeams,
  };
}

export function resolveTeamDetailPageState(input: {
  team: TeamDetail | undefined;
  canManageTeams: boolean;
  currentUserWorkosId: string;
}) {
  const members = input.team?.members ?? [];
  const currentUserMembership = members.find(
    (member) => member.workosUserId === input.currentUserWorkosId,
  );
  const canManageMembers = input.canManageTeams || currentUserMembership?.role === "manager";

  return {
    team: input.team,
    members,
    canManageMembers,
    canManageTeams: input.canManageTeams,
    currentUserMembership,
  };
}

export function listAssignableMembers(input: {
  directory: OrganizationMemberDirectoryEntry[];
  members: TeamMemberRow[];
}) {
  const memberIds = new Set(input.members.map((member) => member.workosUserId));
  return input.directory.filter((entry) => !memberIds.has(entry.workosUserId));
}

export function canRemoveTeamMember(input: {
  member: TeamMemberRow;
  members: TeamMemberRow[];
  canManageMembers: boolean;
}) {
  if (!input.canManageMembers) {
    return false;
  }

  if (input.member.role !== "manager") {
    return true;
  }

  return input.members.filter((member) => member.role === "manager").length > 1;
}

export function canUpdateTeamMemberRole(input: {
  member: TeamMemberRow;
  members: TeamMemberRow[];
  canManageMembers: boolean;
}) {
  if (!input.canManageMembers) {
    return false;
  }

  if (input.member.role !== "manager") {
    return true;
  }

  return input.members.filter((member) => member.role === "manager").length > 1;
}
