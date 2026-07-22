/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import {
  isActiveOrganizationMembership,
  isReplacingWorkosMembership,
} from "@/lib/workos/constants";

/** How organization membership should be interpreted for access decisions. */
export type OrganizationMembershipAccessSource =
  | "workos_authoritative"
  | "pending_invite"
  | "replacing_invite";

export function resolveOrganizationMembershipAccessSource(
  workosMembershipId: string | null | undefined,
): OrganizationMembershipAccessSource {
  if (isReplacingWorkosMembership(workosMembershipId)) {
    return "replacing_invite";
  }

  if (isActiveOrganizationMembership(workosMembershipId)) {
    return "workos_authoritative";
  }

  return "pending_invite";
}

export function grantsOrganizationAccess(accessSource: OrganizationMembershipAccessSource) {
  return accessSource === "workos_authoritative";
}
