export const INVITED_WORKOS_USER_ID_PREFIX = "invited_user_";

/** Local-only marker while an in-flight invite replace revokes the prior WorkOS invitation. */
export const REPLACING_WORKOS_MEMBERSHIP_ID = "replacing";

export function isReplacingWorkosMembership(workosMembershipId: string | null | undefined) {
  return workosMembershipId === REPLACING_WORKOS_MEMBERSHIP_ID;
}

/** WorkOS has confirmed organization membership (invite accepted). */
export function isActiveOrganizationMembership(workosMembershipId: string | null | undefined) {
  return (
    workosMembershipId != null &&
    workosMembershipId.length > 0 &&
    !isReplacingWorkosMembership(workosMembershipId)
  );
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

/** True when WorkOS API calls are explicitly enabled and a non-placeholder key is configured. */
export function isLiveWorkosApiKey(input: { workosEnabled: boolean; apiKey: string | undefined }) {
  if (!input.workosEnabled) {
    return false;
  }

  const apiKey = input.apiKey;
  if (!apiKey) {
    return false;
  }

  if (apiKey === "test-workos-api-key" || apiKey === "your-workos-api-key") {
    return false;
  }

  if (apiKey.includes("placeholder")) {
    return false;
  }

  return apiKey.startsWith("sk_");
}
