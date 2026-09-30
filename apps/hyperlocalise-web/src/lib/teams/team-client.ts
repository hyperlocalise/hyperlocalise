/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import type { TeamMember, TeamRecord, TeamSummary } from "@/lib/go-svc/go-svc-client.types";
import type { AddTeamMemberBody, CreateTeamBody, UpdateTeamBody } from "@/lib/teams/team.schema";

export type { TeamMember, TeamRecord, TeamSummary };

type OrgParams = { organizationSlug: string };
type TeamParams = OrgParams & { teamId: string };

export function createTeamClient(goSvcClient: GoSvcClient) {
  return {
    list: ({ param }: { param: OrgParams }) => goSvcClient.team.list(param.organizationSlug),
    memberDirectory: ({ param }: { param: OrgParams }) =>
      goSvcClient.team.memberDirectory(param.organizationSlug),
    create: ({ param, json }: { param: OrgParams; json: CreateTeamBody }) =>
      goSvcClient.team.create(param.organizationSlug, json),
    get: ({ param }: { param: TeamParams }) =>
      goSvcClient.team.get(param.organizationSlug, param.teamId),
    update: ({ param, json }: { param: TeamParams; json: UpdateTeamBody }) =>
      goSvcClient.team.update(param.organizationSlug, param.teamId, json),
    delete: ({ param }: { param: TeamParams }) =>
      goSvcClient.team.delete(param.organizationSlug, param.teamId),
    addMember: ({ param, json }: { param: TeamParams; json: AddTeamMemberBody }) =>
      goSvcClient.team.members.add(param.organizationSlug, param.teamId, json),
    removeMember: ({ param }: { param: TeamParams & { workosUserId: string } }) =>
      goSvcClient.team.members.remove(param.organizationSlug, param.teamId, param.workosUserId),
  };
}
