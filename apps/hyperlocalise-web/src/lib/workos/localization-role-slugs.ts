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
