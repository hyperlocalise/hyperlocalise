/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import {
  getCapabilitiesForRole,
  ORGANIZATION_CAPABILITIES,
  type OrganizationCapability,
} from "@/api/auth/policy";
import type { OrganizationMembershipRole } from "@/lib/database/types";

export type WorkosLocalizationPermissionDefinition = {
  slug: OrganizationCapability;
  name: string;
  description: string;
};

function humanizeCapabilitySlug(slug: OrganizationCapability): string {
  return slug
    .split(":")
    .map((segment) =>
      segment
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
    )
    .join(" — ");
}

/** WorkOS permission slugs mirror `OrganizationCapability` values in policy.ts. */
export const WORKOS_LOCALIZATION_PERMISSION_DEFINITIONS: WorkosLocalizationPermissionDefinition[] =
  ORGANIZATION_CAPABILITIES.map((slug) => ({
    slug,
    name: humanizeCapabilitySlug(slug),
    description: `Hyperlocalise capability: ${slug}`,
  }));

export function getWorkosPermissionSlugsForRole(
  role: OrganizationMembershipRole,
): OrganizationCapability[] {
  return getCapabilitiesForRole(role);
}
