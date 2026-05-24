export const INVITED_WORKOS_USER_ID_PREFIX = "invited_user_";
export const LOCAL_PLACEHOLDER_WORKOS_USER_ID_PREFIX = "local_user_";

export function isInvitedPlaceholderWorkosUserId(workosUserId: string) {
  return workosUserId.startsWith(INVITED_WORKOS_USER_ID_PREFIX);
}

export function isLocalPlaceholderWorkosUserId(workosUserId: string) {
  return workosUserId.startsWith(LOCAL_PLACEHOLDER_WORKOS_USER_ID_PREFIX);
}

export function shouldCleanupPlaceholderUserOnMemberRemoval(input: {
  workosUserId: string;
  isLocallyManagedOrganization: boolean;
}) {
  return (
    isInvitedPlaceholderWorkosUserId(input.workosUserId) ||
    (input.isLocallyManagedOrganization && isLocalPlaceholderWorkosUserId(input.workosUserId))
  );
}
