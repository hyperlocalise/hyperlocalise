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
import type { OrganizationMembershipRole } from "@/lib/database/types";

import type { GoSvcRequestOptions, MemberRecord, MembersResponse } from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

export type InviteMemberBody = {
  email: string;
  role?: OrganizationMembershipRole;
  teamId?: string;
};

export type UpdateMemberBody = {
  role: OrganizationMembershipRole;
};

export class GoSvcMemberApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<MembersResponse>(orgPath(organizationSlug, "members"), options);
  }

  invite(organizationSlug: string, body: InviteMemberBody, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ member: MemberRecord }>(orgPath(organizationSlug, "members"), {
      method: "POST",
      body,
      ...options,
    });
  }

  update(
    organizationSlug: string,
    workosUserId: string,
    body: UpdateMemberBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ member: MemberRecord }>(
      orgPath(organizationSlug, "members", workosUserId),
      { method: "PATCH", body, ...options },
    );
  }

  remove(organizationSlug: string, workosUserId: string, options: GoSvcRequestOptions = {}) {
    return this.request.empty(orgPath(organizationSlug, "members", workosUserId), {
      method: "DELETE",
      ...options,
    });
  }
}
