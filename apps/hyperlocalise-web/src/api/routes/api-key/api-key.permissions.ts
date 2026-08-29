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
import { hasCapability, type OrganizationCapability } from "@/api/auth/policy";
import type { OrganizationMembershipRole } from "@/lib/database/types";

import { defaultApiKeyPermissions, type ApiKeyPermission } from "./api-key.schema";

/**
 * Each token scope names the organization capability its owner must hold.
 * Applied at creation (what may be granted) and on every request (what the
 * token may still do). See the personal access token contract.
 */
export const apiKeyScopeCapabilityMap = {
  "jobs:read": "jobs:read",
  "jobs:write": "jobs:write",
  "files:read": "projects:read",
  "files:write": "jobs:create",
} as const satisfies Record<ApiKeyPermission, OrganizationCapability>;

export function getGrantableApiKeyPermissions(
  role: OrganizationMembershipRole,
): ApiKeyPermission[] {
  return defaultApiKeyPermissions.filter((scope) =>
    hasCapability(role, apiKeyScopeCapabilityMap[scope]),
  );
}

export function getRefusedApiKeyPermissions(
  role: OrganizationMembershipRole,
  requested: readonly ApiKeyPermission[],
): ApiKeyPermission[] {
  const grantable = new Set(getGrantableApiKeyPermissions(role));
  return requested.filter((scope) => !grantable.has(scope));
}

export function ownerCanExerciseApiKeyPermission(
  role: OrganizationMembershipRole,
  permission: string,
): boolean {
  if (!isApiKeyPermission(permission)) {
    return false;
  }

  return hasCapability(role, apiKeyScopeCapabilityMap[permission]);
}

function isApiKeyPermission(permission: string): permission is ApiKeyPermission {
  return (defaultApiKeyPermissions as readonly string[]).includes(permission);
}
