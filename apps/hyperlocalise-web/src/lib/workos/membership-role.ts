import type { OrganizationMembershipRole } from "@/lib/database/types";

export function membershipRoleToWorkosRoleSlug(role: OrganizationMembershipRole) {
  if (role === "owner" || role === "admin") {
    return role;
  }

  return "member";
}

export function workosRoleSlugToMembershipRole(
  roleSlug: string | undefined,
): OrganizationMembershipRole {
  if (roleSlug === "owner" || roleSlug === "admin") {
    return roleSlug;
  }

  return "member";
}

export function membershipRoleFromUnknownRoleField(roleField: unknown): OrganizationMembershipRole {
  const slug =
    typeof roleField === "string"
      ? roleField
      : typeof roleField === "object" && roleField !== null && "slug" in roleField
        ? String((roleField as { slug: unknown }).slug)
        : undefined;

  return workosRoleSlugToMembershipRole(slug);
}
