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
