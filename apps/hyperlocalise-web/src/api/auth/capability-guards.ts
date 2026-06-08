import { hasCapability, type OrganizationCapability } from "@/api/auth/policy";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";
import {
  isJobProviderActionId,
  type JobProviderActionId,
} from "@/lib/providers/job-provider-action-ids";

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

export function isWriteBackTranslationAllowed(role: OrganizationMembershipRole): boolean {
  return hasCapability(role, "write_back:translation");
}

export function isIntegrationsReadAllowed(role: OrganizationMembershipRole): boolean {
  return hasCapability(role, "integrations:read");
}

export function isProviderCredentialReadAllowed(role: OrganizationMembershipRole): boolean {
  return hasCapability(role, "provider_credentials:read");
}

function isKnownJobProviderActionAllowed(
  role: OrganizationMembershipRole,
  action: JobProviderActionId,
): boolean {
  switch (action) {
    case "push_approved_changes":
      return isWriteBackApproveAllowed(role);
    case "translate_with_agent":
    case "review_with_agent":
    case "run_qa_checks":
    case "fix_qa_issues":
    case "leave_provider_comment":
      return isAiActionAllowed(role);
    default:
      return assertNever(action);
  }
}

/** Provider job agent actions: write-back approval vs AI execution. */
export function isJobProviderActionAllowed(
  role: OrganizationMembershipRole,
  action: string,
): boolean {
  if (!isJobProviderActionId(action)) {
    return false;
  }

  return isKnownJobProviderActionAllowed(role, action);
}
