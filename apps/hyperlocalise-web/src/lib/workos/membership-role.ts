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
import type { OrganizationMembershipRole } from "@/lib/database/types";

import {
  isKnownWorkosLocalizationRoleSlug,
  MEMBERSHIP_ROLE_BY_WORKOS_ROLE_SLUG,
  WORKOS_ROLE_SLUG_BY_MEMBERSHIP_ROLE,
  type WorkosLocalizationRoleSlug,
} from "./localization-role-slugs";

export function membershipRoleToWorkosRoleSlug(
  role: OrganizationMembershipRole,
): WorkosLocalizationRoleSlug {
  return WORKOS_ROLE_SLUG_BY_MEMBERSHIP_ROLE[role];
}

/**
 * Maps a WorkOS role slug to a cached membership role. Returns `null` for
 * unknown slugs so reconcile and capability checks default deny.
 */
export function workosRoleSlugToMembershipRole(
  roleSlug: string | undefined,
): OrganizationMembershipRole | null {
  if (!isKnownWorkosLocalizationRoleSlug(roleSlug)) {
    return null;
  }

  return MEMBERSHIP_ROLE_BY_WORKOS_ROLE_SLUG[roleSlug];
}

export function membershipRoleFromUnknownRoleField(
  roleField: unknown,
): OrganizationMembershipRole | null {
  const slug =
    typeof roleField === "string"
      ? roleField
      : typeof roleField === "object" && roleField !== null && "slug" in roleField
        ? String((roleField as { slug: unknown }).slug)
        : undefined;

  return workosRoleSlugToMembershipRole(slug);
}
