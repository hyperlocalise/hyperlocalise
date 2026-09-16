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
import type {
  AddTeamMemberBody,
  CreateTeamBody,
  TeamRecord,
  TeamRole,
  TeamWithMembersResponse,
  TeamsResponse,
  UpdateTeamBody,
} from "@/lib/teams/team.schema";
import { teamClient } from "@/lib/teams/team-client";
import { readApiResponseError } from "@/lib/api-error";

export type TeamSummaryRow = TeamsResponse["teams"][number];

export type TeamMemberRow = TeamWithMembersResponse["team"]["members"][number];

export type TeamDetail = TeamWithMembersResponse["team"];

export type OrganizationMemberDirectoryEntry = {
  workosUserId: string;
  email: string;
};

export type TeamsApi = {
  listTeams(organizationSlug: string): Promise<TeamSummaryRow[]>;
  getTeam(organizationSlug: string, teamId: string): Promise<TeamDetail>;
  listMemberDirectory(organizationSlug: string): Promise<OrganizationMemberDirectoryEntry[]>;
  createTeam(organizationSlug: string, body: CreateTeamBody): Promise<TeamRecord>;
  updateTeam(organizationSlug: string, teamId: string, body: UpdateTeamBody): Promise<TeamRecord>;
  deleteTeam(organizationSlug: string, teamId: string): Promise<void>;
  addTeamMember(
    organizationSlug: string,
    teamId: string,
    body: AddTeamMemberBody,
  ): Promise<TeamMemberRow>;
  removeTeamMember(organizationSlug: string, teamId: string, workosUserId: string): Promise<void>;
};

export function createTeamsApi(): TeamsApi {
  return {
    async listTeams(organizationSlug) {
      const response = await teamClient.list({ param: { organizationSlug } });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load teams");
      }
      const body = (await response.json()) as TeamsResponse;
      return body.teams;
    },

    async getTeam(organizationSlug, teamId) {
      const response = await teamClient.get({ param: { organizationSlug, teamId } });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load team");
      }
      const body = (await response.json()) as TeamWithMembersResponse;
      return body.team;
    },

    async listMemberDirectory(organizationSlug) {
      const response = await teamClient.memberDirectory({ param: { organizationSlug } });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load member directory");
      }
      const body = (await response.json()) as { members: OrganizationMemberDirectoryEntry[] };
      return body.members;
    },

    async createTeam(organizationSlug, body) {
      const response = await teamClient.create({ param: { organizationSlug }, json: body });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to create team");
      }
      const result = (await response.json()) as { team: TeamRecord };
      return result.team;
    },

    async updateTeam(organizationSlug, teamId, body) {
      const response = await teamClient.update({ param: { organizationSlug, teamId }, json: body });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to update team");
      }
      const result = (await response.json()) as { team: TeamRecord };
      return result.team;
    },

    async deleteTeam(organizationSlug, teamId) {
      const response = await teamClient.delete({ param: { organizationSlug, teamId } });
      if (response.status !== 204 && !response.ok) {
        throw await readApiResponseError(response, "Failed to delete team");
      }
    },

    async addTeamMember(organizationSlug, teamId, body) {
      const response = await teamClient.addMember({
        param: { organizationSlug, teamId },
        json: body,
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to add team member");
      }
      const result = (await response.json()) as { member: TeamMemberRow };
      return result.member;
    },

    async removeTeamMember(organizationSlug, teamId, workosUserId) {
      const response = await teamClient.removeMember({
        param: { organizationSlug, teamId, workosUserId },
      });
      if (response.status !== 204 && !response.ok) {
        throw await readApiResponseError(response, "Failed to remove team member");
      }
    },
  };
}

export type { TeamRole };
