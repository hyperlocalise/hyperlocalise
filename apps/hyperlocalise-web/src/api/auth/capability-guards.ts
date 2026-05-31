import { hasCapability, type OrganizationCapability } from "@/api/auth/policy";
import type { OrganizationMembershipRole } from "@/lib/database/types";

export function roleHasCapability(
  role: OrganizationMembershipRole,
  capability: OrganizationCapability,
): boolean {
  return hasCapability(role, capability);
}

export function isProjectCreateAllowed(role: OrganizationMembershipRole): boolean {
  return hasCapability(role, "projects:create");
}

export function isProjectWriteAllowed(role: OrganizationMembershipRole): boolean {
  return hasCapability(role, "projects:write");
}

/** Project metadata mutations (update, delete, sync settings). */
export function isProjectMutationAllowed(role: OrganizationMembershipRole): boolean {
  return isProjectWriteAllowed(role);
}

export function isJobCreateAllowed(role: OrganizationMembershipRole): boolean {
  return hasCapability(role, "jobs:create");
}

export function isJobWriteAllowed(role: OrganizationMembershipRole): boolean {
  return hasCapability(role, "jobs:write");
}

/** Job lifecycle mutations (retry, cancel, update). */
export function isJobMutationAllowed(role: OrganizationMembershipRole): boolean {
  return isJobWriteAllowed(role);
}

export function isAiActionAllowed(role: OrganizationMembershipRole): boolean {
  return hasCapability(role, "ai_actions:run");
}

export function isReviewApproveAllowed(role: OrganizationMembershipRole): boolean {
  return hasCapability(role, "reviews:approve");
}

export function isWriteBackApproveAllowed(role: OrganizationMembershipRole): boolean {
  return hasCapability(role, "write_back:approve");
}

export function isIntegrationsReadAllowed(role: OrganizationMembershipRole): boolean {
  return hasCapability(role, "integrations:read");
}

export function isProviderCredentialReadAllowed(role: OrganizationMembershipRole): boolean {
  return hasCapability(role, "provider_credentials:read");
}

/** Provider job agent actions: write-back approval vs AI execution. */
export function isJobProviderActionAllowed(
  role: OrganizationMembershipRole,
  action: string,
): boolean {
  if (action === "push_approved_changes") {
    return isWriteBackApproveAllowed(role);
  }

  return isAiActionAllowed(role);
}
