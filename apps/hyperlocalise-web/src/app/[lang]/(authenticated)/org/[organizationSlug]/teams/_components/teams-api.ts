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
  TeamRole,
  TeamWithMembersResponse,
  TeamsResponse,
  UpdateTeamBody,
} from "@/lib/teams/team.schema";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import type { TeamRecord } from "@/lib/go-svc/go-svc-client.types";
import { createTeamClient } from "@/lib/teams/team-client";

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

export function createTeamsApi(goSvcClient: GoSvcClient): TeamsApi {
  const teamClient = createTeamClient(goSvcClient);

  return {
    async listTeams(organizationSlug) {
      const response = await teamClient.list({ param: { organizationSlug } });
      return response.teams;
    },

    async getTeam(organizationSlug, teamId) {
      const response = await teamClient.get({ param: { organizationSlug, teamId } });
      return response.team as TeamWithMembersResponse["team"];
    },

    async listMemberDirectory(organizationSlug) {
      const response = await teamClient.memberDirectory({ param: { organizationSlug } });
      return response.members;
    },

    async createTeam(organizationSlug, body) {
      const response = await teamClient.create({ param: { organizationSlug }, json: body });
      return response.team;
    },

    async updateTeam(organizationSlug, teamId, body) {
      const response = await teamClient.update({ param: { organizationSlug, teamId }, json: body });
      return response.team;
    },

    async deleteTeam(organizationSlug, teamId) {
      await teamClient.delete({ param: { organizationSlug, teamId } });
    },

    async addTeamMember(organizationSlug, teamId, body) {
      const response = await teamClient.addMember({
        param: { organizationSlug, teamId },
        json: body,
      });
      return response.member;
    },

    async removeTeamMember(organizationSlug, teamId, workosUserId) {
      await teamClient.removeMember({
        param: { organizationSlug, teamId, workosUserId },
      });
    },
  };
}

export type { TeamRole };
