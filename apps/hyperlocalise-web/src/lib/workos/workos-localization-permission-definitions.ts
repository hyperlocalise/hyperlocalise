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
