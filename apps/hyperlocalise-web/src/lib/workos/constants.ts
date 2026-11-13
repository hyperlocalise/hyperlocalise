/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { sql, type SQLWrapper } from "drizzle-orm";

export const INVITED_WORKOS_USER_ID_PREFIX = "invited_user_";

/** Legacy shared marker; new writes use a per-membership id under this prefix. */
export const REPLACING_WORKOS_MEMBERSHIP_ID = "replacing";

/** Prefix for local-only markers while an invite replace/revoke is in flight. */
export const REPLACING_WORKOS_MEMBERSHIP_ID_PREFIX = "replacing:";

export function replacingWorkosMembershipId(membershipId: string) {
  return `${REPLACING_WORKOS_MEMBERSHIP_ID_PREFIX}${membershipId}`;
}

export function isReplacingWorkosMembership(workosMembershipId: string | null | undefined) {
  return (
    workosMembershipId === REPLACING_WORKOS_MEMBERSHIP_ID ||
    (workosMembershipId?.startsWith(REPLACING_WORKOS_MEMBERSHIP_ID_PREFIX) ?? false)
  );
}

export function isReplacingWorkosMembershipSql(column: SQLWrapper) {
  return sql`(${column} = ${REPLACING_WORKOS_MEMBERSHIP_ID} or ${column} like ${`${REPLACING_WORKOS_MEMBERSHIP_ID_PREFIX}%`})`;
}

export function excludeReplacingWorkosMembershipSql(column: SQLWrapper) {
  return sql`${column} <> ${REPLACING_WORKOS_MEMBERSHIP_ID} and ${column} not like ${`${REPLACING_WORKOS_MEMBERSHIP_ID_PREFIX}%`}`;
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
