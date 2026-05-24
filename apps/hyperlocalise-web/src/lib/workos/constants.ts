export const INVITED_WORKOS_USER_ID_PREFIX = "invited_user_";

export function isInvitedPlaceholderWorkosUserId(workosUserId: string) {
  return workosUserId.startsWith(INVITED_WORKOS_USER_ID_PREFIX);
}
