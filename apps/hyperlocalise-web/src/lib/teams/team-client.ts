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
  TeamMemberResponse,
  TeamResponse,
  TeamsResponse,
  TeamWithMembersResponse,
  UpdateTeamBody,
} from "@/lib/teams/team.schema";

type OrgParams = { organizationSlug: string };
type TeamParams = OrgParams & { teamId: string };
type TeamMemberParams = TeamParams & { workosUserId: string };

type TeamResponseBody<T> = Omit<Response, "json"> & { json(): Promise<T> };

type RequestInput<P, B> = { param: P } & ([B] extends [never] ? {} : { json: B });

function teamEndpoint<P extends OrgParams, B, T>(method: string, path: string) {
  return async (input: RequestInput<P, B>): Promise<TeamResponseBody<T>> => {
    const pathname = path.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
      const value = (input.param as Record<string, string>)[key];
      if (!value) {
        throw new Error(`Missing team path parameter: ${key}`);
      }
      return encodeURIComponent(value);
    });
    return fetch(
      `/api/go-svc/v1/orgs/:organizationSlug${pathname}`.replace(
        ":organizationSlug",
        encodeURIComponent(input.param.organizationSlug),
      ),
      {
        method,
        credentials: "same-origin",
        ...("json" in input
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.json) }
          : {}),
      },
    ) as Promise<TeamResponseBody<T>>;
  };
}

export const teamClient = {
  list: teamEndpoint<OrgParams, never, TeamsResponse>("GET", "/teams"),
  memberDirectory: teamEndpoint<
    OrgParams,
    never,
    { members: { workosUserId: string; email: string }[] }
  >("GET", "/teams/member-directory"),
  create: teamEndpoint<OrgParams, CreateTeamBody, TeamResponse>("POST", "/teams"),
  get: teamEndpoint<TeamParams, never, TeamWithMembersResponse>("GET", "/teams/:teamId"),
  update: teamEndpoint<TeamParams, UpdateTeamBody, TeamResponse>("PATCH", "/teams/:teamId"),
  delete: teamEndpoint<TeamParams, never, never>("DELETE", "/teams/:teamId"),
  addMember: teamEndpoint<TeamParams, AddTeamMemberBody, TeamMemberResponse>(
    "POST",
    "/teams/:teamId/members",
  ),
  removeMember: teamEndpoint<TeamMemberParams, never, never>(
    "DELETE",
    "/teams/:teamId/members/:workosUserId",
  ),
};
