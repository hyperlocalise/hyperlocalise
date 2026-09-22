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
  GoSvcRequestOptions,
  TeamMember,
  TeamRecord,
  TeamSummary,
} from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

export class GoSvcTeamApi {
  readonly members: GoSvcTeamMembersApi;

  constructor(private readonly request: GoSvcRequest) {
    this.members = new GoSvcTeamMembersApi(request);
  }

  list(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ teams: TeamSummary[] }>(orgPath(organizationSlug, "teams"), options);
  }

  memberDirectory(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ members: { workosUserId: string; email: string }[] }>(
      orgPath(organizationSlug, "teams", "member-directory"),
      options,
    );
  }

  create(
    organizationSlug: string,
    body: { name: string; slug?: string },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ team: TeamRecord }>(orgPath(organizationSlug, "teams"), {
      method: "POST",
      body,
      ...options,
    });
  }

  get(organizationSlug: string, teamId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ team: TeamRecord & { members: TeamMember[] } }>(
      orgPath(organizationSlug, "teams", teamId),
      options,
    );
  }

  update(
    organizationSlug: string,
    teamId: string,
    body: { name?: string; slug?: string },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ team: TeamRecord }>(orgPath(organizationSlug, "teams", teamId), {
      method: "PATCH",
      body,
      ...options,
    });
  }

  delete(organizationSlug: string, teamId: string, options: GoSvcRequestOptions = {}) {
    return this.request.empty(orgPath(organizationSlug, "teams", teamId), {
      method: "DELETE",
      ...options,
    });
  }
}

export class GoSvcTeamMembersApi {
  constructor(private readonly request: GoSvcRequest) {}

  add(
    organizationSlug: string,
    teamId: string,
    body: { workosUserId?: string; email?: string; role?: TeamMember["role"] },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ member: TeamMember }>(
      orgPath(organizationSlug, "teams", teamId, "members"),
      { method: "POST", body, ...options },
    );
  }

  remove(
    organizationSlug: string,
    teamId: string,
    workosUserId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(orgPath(organizationSlug, "teams", teamId, "members", workosUserId), {
      method: "DELETE",
      ...options,
    });
  }
}
