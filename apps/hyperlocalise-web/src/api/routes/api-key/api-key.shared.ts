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
import { and, eq } from "drizzle-orm";
import type { z } from "zod";

import type { ApiAuthContext } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
import { validationErrorResponse } from "@/api/errors";
import {
  forbiddenResponse as sharedForbiddenResponse,
  notFoundResponse,
  type JsonContext,
} from "@/api/response.schema";
import * as schema from "@/lib/database/schema";

export function invalidApiKeyPayloadResponse(
  c: { json: JsonContext["json"] },
  issues?: z.ZodIssue[],
) {
  return validationErrorResponse(c, "invalid_api_key_payload", "Invalid API key payload", issues);
}

export function apiKeyNotFoundResponse(c: { json: JsonContext["json"] }) {
  return notFoundResponse(c, "api_key_not_found", "API key not found");
}

export function forbiddenResponse(c: { json: JsonContext["json"] }) {
  return sharedForbiddenResponse(c, "forbidden", "Insufficient permissions");
}

/**
 * `api_keys:read` and `api_keys:write` govern other members' tokens, not the
 * caller's own. Acting on your own token needs nothing beyond an active
 * membership. See `docs/adr/2026-08-29-personal-access-token-contract-design.md`.
 */
export function canAdministerOtherUsersApiKeys(role: ApiAuthContext["membership"]["role"]) {
  return hasCapability(role, "api_keys:read");
}

export function canRevokeOtherUsersApiKeys(role: ApiAuthContext["membership"]["role"]) {
  return hasCapability(role, "api_keys:write");
}

function organizationApiKeyScope(auth: ApiAuthContext) {
  return eq(schema.organizationApiKeys.organizationId, auth.organization.localOrganizationId);
}

function ownedByCaller(auth: ApiAuthContext) {
  return eq(schema.organizationApiKeys.createdByUserId, auth.user.localUserId);
}

/** Tokens the caller may list: their own, or every token when they administer tokens. */
export function visibleApiKeysWhere(auth: ApiAuthContext) {
  if (canAdministerOtherUsersApiKeys(auth.membership.role)) {
    return organizationApiKeyScope(auth);
  }

  return and(organizationApiKeyScope(auth), ownedByCaller(auth));
}

/**
 * A single token the caller may revoke: their own, or any token in the
 * organization when they hold `api_keys:write`. A token that does not match is
 * indistinguishable from an unknown id, so callers cannot probe for other
 * members' tokens.
 */
export function revocableApiKeyWhere(auth: ApiAuthContext, apiKeyId: string) {
  const identityScope = and(
    eq(schema.organizationApiKeys.id, apiKeyId),
    organizationApiKeyScope(auth),
  );

  if (canRevokeOtherUsersApiKeys(auth.membership.role)) {
    return identityScope;
  }

  return and(identityScope, ownedByCaller(auth));
}

/** Owner columns joined from `users`. Null for a token whose owner is unresolvable. */
export const apiKeyOwnerColumns = {
  ownerUserId: schema.users.id,
  ownerEmail: schema.users.email,
  ownerFirstName: schema.users.firstName,
  ownerLastName: schema.users.lastName,
} as const;

type ApiKeyOwnerRow = {
  ownerUserId: string | null;
  ownerEmail: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
};

export function toApiKeyOwner(row: ApiKeyOwnerRow) {
  if (!row.ownerUserId || row.ownerEmail === null) {
    return null;
  }

  return {
    userId: row.ownerUserId,
    email: row.ownerEmail,
    firstName: row.ownerFirstName,
    lastName: row.ownerLastName,
  };
}
