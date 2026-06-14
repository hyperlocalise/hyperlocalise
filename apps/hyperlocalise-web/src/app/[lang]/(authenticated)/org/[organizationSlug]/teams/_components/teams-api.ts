import type {
  AddTeamMemberBody,
  CreateTeamBody,
  TeamRecord,
  TeamRole,
  TeamWithMembersResponse,
  TeamsResponse,
  UpdateTeamBody,
} from "@/api/routes/team/team.schema";
import type { createApiClient } from "@/lib/api-client";
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

type ApiClient = ReturnType<typeof createApiClient>;

export function createTeamsApi(client: ApiClient): TeamsApi {
  const teams = client.api.orgs[":organizationSlug"].teams;

  return {
    async listTeams(organizationSlug) {
      const response = await teams.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load teams");
      }
      const body = (await response.json()) as TeamsResponse;
      return body.teams;
    },

    async getTeam(organizationSlug, teamId) {
      const response = await teams[":teamId"].$get({
        param: { organizationSlug, teamId },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load team");
      }
      const body = (await response.json()) as TeamWithMembersResponse;
      return body.team;
    },

    async listMemberDirectory(organizationSlug) {
      const response = await teams["member-directory"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load member directory");
      }
      const body = (await response.json()) as { members: OrganizationMemberDirectoryEntry[] };
      return body.members;
    },

    async createTeam(organizationSlug, body) {
      const response = await teams.$post({
        param: { organizationSlug },
        json: body,
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to create team");
      }
      const result = (await response.json()) as { team: TeamRecord };
      return result.team;
    },

    async updateTeam(organizationSlug, teamId, body) {
      const response = await teams[":teamId"].$patch({
        param: { organizationSlug, teamId },
        json: body,
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to update team");
      }
      const result = (await response.json()) as { team: TeamRecord };
      return result.team;
    },

    async deleteTeam(organizationSlug, teamId) {
      const response = await teams[":teamId"].$delete({
        param: { organizationSlug, teamId },
      });
      if (response.status !== 204 && !response.ok) {
        throw await readApiResponseError(response, "Failed to delete team");
      }
    },

    async addTeamMember(organizationSlug, teamId, body) {
      const response = await teams[":teamId"].members.$post({
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
      const response = await teams[":teamId"].members[":workosUserId"].$delete({
        param: { organizationSlug, teamId, workosUserId },
      });
      if (response.status !== 204 && !response.ok) {
        throw await readApiResponseError(response, "Failed to remove team member");
      }
    },
  };
}

export type { TeamRole };
