/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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

/** True when a non-placeholder WorkOS API key is configured. */
export function isLiveWorkosApiKey(apiKey: string | undefined) {
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
