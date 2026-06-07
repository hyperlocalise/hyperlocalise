import type { TeamRole } from "@/api/routes/team/team.schema";

import type {
  OrganizationMemberDirectoryEntry,
  TeamDetail,
  TeamMemberRow,
  TeamSummaryRow,
} from "./teams-api";

const teamRoleLabels: Record<TeamRole, string> = {
  manager: "Manager",
  member: "Member",
};

const teamRoleDescriptions: Record<TeamRole, string> = {
  manager: "Can add or remove people and update team membership roles.",
  member: "Can access projects and work assigned to this team.",
};

export function getTeamRoleLabel(role: TeamRole) {
  return teamRoleLabels[role];
}

export function getTeamRoleDescription(role: TeamRole) {
  return teamRoleDescriptions[role];
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
  currentUserWorkosId: string;
}) {
  if (!input.canManageMembers) {
    return false;
  }

  if (input.member.workosUserId === input.currentUserWorkosId) {
    const managerCount = input.members.filter((member) => member.role === "manager").length;
    return managerCount > 1 || input.member.role !== "manager";
  }

  return true;
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
