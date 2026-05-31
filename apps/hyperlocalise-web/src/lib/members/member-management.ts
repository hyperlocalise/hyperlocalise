import { hasCapability, isOrganizationAdminRole, isWorkspaceOperatorRole } from "@/api/auth/policy";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { WORKOS_LOCALIZATION_ROLE_DEFINITIONS } from "@/lib/workos/workos-localization-role-definitions";

export type MemberApiStatus = "active" | "invited";

/** Display order for role selects in member settings. */
export const MEMBER_SETTINGS_ROLE_ORDER: OrganizationMembershipRole[] = [
  "admin",
  "localization_manager",
  "developer",
  "reviewer",
  "translator",
  "contractor",
  "member",
];

const NON_ADMIN_ASSIGNABLE_ROLES: OrganizationMembershipRole[] = MEMBER_SETTINGS_ROLE_ORDER.filter(
  (role) => role !== "admin",
);

const roleDefinitionBySlug = new Map(
  WORKOS_LOCALIZATION_ROLE_DEFINITIONS.map((definition) => [definition.slug, definition]),
);

export const MANUAL_LOCALIZATION_ACCESS_NOTICE =
  "Localization roles are assigned manually in Hyperlocalise. They are not synced from SCIM directory groups.";

export const CONTRACTOR_ACCESS_NOTICE =
  "Contractors can only access projects and jobs they are explicitly assigned to. They cannot browse the full workspace or manage organization settings.";

export function getRoleLabel(role: OrganizationMembershipRole): string {
  return roleDefinitionBySlug.get(role)?.name ?? role;
}

export function getRoleDescription(role: OrganizationMembershipRole): string {
  return roleDefinitionBySlug.get(role)?.description ?? "";
}

export function getMembershipStatusLabel(status: MemberApiStatus): string {
  if (status === "invited") {
    return "Pending";
  }

  return "Active";
}

export function getMembershipStatusDescription(status: MemberApiStatus): string {
  if (status === "invited") {
    return "Invitation sent; access starts after they accept.";
  }

  return "Signed in with an active workspace membership.";
}

export function assignableRolesForActor(
  actorRole: OrganizationMembershipRole,
): OrganizationMembershipRole[] {
  if (isOrganizationAdminRole(actorRole)) {
    return [...MEMBER_SETTINGS_ROLE_ORDER];
  }

  if (isWorkspaceOperatorRole(actorRole) && hasCapability(actorRole, "members:invite")) {
    return NON_ADMIN_ASSIGNABLE_ROLES;
  }

  return [];
}

export function canActorAssignRole(
  actorRole: OrganizationMembershipRole,
  role: OrganizationMembershipRole,
): boolean {
  return assignableRolesForActor(actorRole).includes(role);
}

export function canActorManageTarget(
  actorRole: OrganizationMembershipRole,
  targetRole: OrganizationMembershipRole,
  nextRole?: OrganizationMembershipRole,
): boolean {
  if (!hasCapability(actorRole, "members:invite")) {
    return false;
  }

  if (!canActorAssignRole(actorRole, targetRole)) {
    return false;
  }

  if (nextRole !== undefined && !canActorAssignRole(actorRole, nextRole)) {
    return false;
  }

  if (isOrganizationAdminRole(targetRole) && !isOrganizationAdminRole(actorRole)) {
    return false;
  }

  if (
    nextRole !== undefined &&
    isOrganizationAdminRole(nextRole) &&
    !isOrganizationAdminRole(actorRole)
  ) {
    return false;
  }

  return true;
}

export function memberRowCapabilities(input: {
  actorRole: OrganizationMembershipRole;
  targetRole: OrganizationMembershipRole;
  isCurrentUser: boolean;
}): { canUpdateRole: boolean; canRemove: boolean } {
  if (input.isCurrentUser) {
    return { canUpdateRole: false, canRemove: false };
  }

  const canManage = canActorManageTarget(input.actorRole, input.targetRole);

  return {
    canUpdateRole: canManage,
    canRemove: canManage,
  };
}

export function buildMemberManagementContext(actorRole: OrganizationMembershipRole) {
  const assignableRoles = assignableRolesForActor(actorRole);

  return {
    canInvite: assignableRoles.length > 0,
    assignableRoles,
  };
}
