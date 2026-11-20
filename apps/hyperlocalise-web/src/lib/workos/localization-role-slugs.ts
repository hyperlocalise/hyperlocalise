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

/**
 * WorkOS organization membership role slugs. Each slug maps 1:1 to
 * `organization_memberships.role` after reconcile or invite.
 */
export const WORKOS_LOCALIZATION_ROLE_SLUGS = [
  "admin",
  "localization_manager",
  "developer",
  "reviewer",
  "translator",
  "member",
] as const;

export type WorkosLocalizationRoleSlug = (typeof WORKOS_LOCALIZATION_ROLE_SLUGS)[number];

export const WORKOS_ROLE_SLUG_BY_MEMBERSHIP_ROLE: Record<
  OrganizationMembershipRole,
  WorkosLocalizationRoleSlug
> = {
  admin: "admin",
  localization_manager: "localization_manager",
  developer: "developer",
  reviewer: "reviewer",
  translator: "translator",
  member: "member",
};

export const MEMBERSHIP_ROLE_BY_WORKOS_ROLE_SLUG: Record<
  WorkosLocalizationRoleSlug,
  OrganizationMembershipRole
> = {
  admin: "admin",
  localization_manager: "localization_manager",
  developer: "developer",
  reviewer: "reviewer",
  translator: "translator",
  member: "member",
};

export function isKnownWorkosLocalizationRoleSlug(
  roleSlug: string | undefined,
): roleSlug is WorkosLocalizationRoleSlug {
  return (
    roleSlug !== undefined &&
    (WORKOS_LOCALIZATION_ROLE_SLUGS as readonly string[]).includes(roleSlug)
  );
}
