export const INVITED_WORKOS_USER_ID_PREFIX = "invited_user_";

/** WorkOS has confirmed organization membership (invite accepted). */
export function isActiveOrganizationMembership(workosMembershipId: string | null | undefined) {
  return workosMembershipId != null && workosMembershipId.length > 0;
}

/** Local membership row exists but WorkOS has not confirmed acceptance yet. */
export function isPendingOrganizationMembership(workosMembershipId: string | null | undefined) {
  return !isActiveOrganizationMembership(workosMembershipId);
}

export function isInvitedPlaceholderWorkosUserId(workosUserId: string) {
  return workosUserId.startsWith(INVITED_WORKOS_USER_ID_PREFIX);
}

export function shouldCleanupPlaceholderUserOnMemberRemoval(workosUserId: string) {
  return isInvitedPlaceholderWorkosUserId(workosUserId);
}
