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
import type { ApiAuthContext } from "@/api/auth/workos";

export type ApiKeyProjectAccessScope = {
  organizationId: string;
  accessibleProjectIds: string[] | null;
};

export function canAccessStoredFileWithProjectScope(
  teamAccess: ApiAuthContext,
  scope: ApiKeyProjectAccessScope,
  input: {
    organizationId: string;
    projectId: string | null;
    createdByUserId?: string | null;
  },
) {
  if (input.organizationId !== scope.organizationId) {
    return false;
  }

  if (input.projectId) {
    return (
      scope.accessibleProjectIds === null || scope.accessibleProjectIds.includes(input.projectId)
    );
  }

  if (scope.accessibleProjectIds === null) {
    return true;
  }

  const uploaderId = input.createdByUserId ?? null;
  if (uploaderId === null) {
    return true;
  }

  return uploaderId === teamAccess.user.localUserId;
}
