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
import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { EvlogVariables } from "evlog/hono";

import { resolveApiKeyTeamAccessContext } from "@/api/auth/api-key-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { ownerCanExerciseApiKeyPermission } from "@/api/routes/api-key/api-key.permissions";
import { forbiddenResponse, unauthorizedResponse } from "@/api/response.schema";
import { db, schema } from "@/lib/database/client";

export type ApiKeyAuthVariables = EvlogVariables["Variables"] & {
  auth: {
    organization: {
      localOrganizationId: string;
    };
    apiKey: {
      id: string;
      permissions: string[];
    };
    teamAccess: ApiAuthContext;
  };
};

/** Shared 401 for unknown, revoked, and ownerless tokens. Do not distinguish them. */
export const INVALID_OR_REVOKED_API_KEY_MESSAGE = "Invalid or revoked API key";

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function apiKeyAuthLogContext(keyRecord: {
  id: string;
  organizationId: string;
  createdByUserId: string | null;
  keyPrefix: string;
}) {
  return {
    auth: {
      apiKeyId: keyRecord.id,
      localOrganizationId: keyRecord.organizationId,
      localUserId: keyRecord.createdByUserId,
      keyPrefix: keyRecord.keyPrefix,
    },
  };
}

/**
 * Best-effort usage telemetry. Failure must never delay or fail the request.
 * Call only after authentication succeeds.
 */
export function touchApiKeyLastUsedAt(apiKeyId: string) {
  db.update(schema.organizationApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.organizationApiKeys.id, apiKeyId))
    .execute()
    .catch(() => {});
}

export const apiKeyAuthMiddleware = createMiddleware<{ Variables: ApiKeyAuthVariables }>(
  async (c, next) => {
    const apiKey = c.req.header("x-api-key");

    if (!apiKey) {
      return unauthorizedResponse(c, "unauthorized", "API key is required");
    }

    const keyHash = hashApiKey(apiKey);

    const [keyRecord] = await db
      .select({
        id: schema.organizationApiKeys.id,
        organizationId: schema.organizationApiKeys.organizationId,
        keyPrefix: schema.organizationApiKeys.keyPrefix,
        permissions: schema.organizationApiKeys.permissions,
        createdByUserId: schema.organizationApiKeys.createdByUserId,
        revokedAt: schema.organizationApiKeys.revokedAt,
        lifecycleStatus: schema.organizations.lifecycleStatus,
      })
      .from(schema.organizationApiKeys)
      .innerJoin(
        schema.organizations,
        eq(schema.organizationApiKeys.organizationId, schema.organizations.id),
      )
      .where(eq(schema.organizationApiKeys.keyHash, keyHash))
      .limit(1);

    // Unknown, revoked, and ownerless tokens share one 401 so callers cannot
    // probe whether a secret hashes to a stored row.
    if (!keyRecord || keyRecord.revokedAt || !keyRecord.createdByUserId) {
      return unauthorizedResponse(c, "unauthorized", INVALID_OR_REVOKED_API_KEY_MESSAGE);
    }

    if (keyRecord.lifecycleStatus !== "active") {
      return forbiddenResponse(c, "workspace_archived", "This workspace has been archived");
    }

    const teamAccess = await resolveApiKeyTeamAccessContext({
      organizationId: keyRecord.organizationId,
      createdByUserId: keyRecord.createdByUserId,
    });

    if (!teamAccess) {
      return forbiddenResponse(
        c,
        "forbidden",
        "API key creator is not authorized for this workspace",
      );
    }

    // Telemetry only. Never block the request, and never write on a rejected
    // credential — lastUsedAt is set only after authentication succeeds.
    touchApiKeyLastUsedAt(keyRecord.id);

    c.set("auth", {
      organization: {
        localOrganizationId: keyRecord.organizationId,
      },
      apiKey: {
        id: keyRecord.id,
        permissions: keyRecord.permissions,
      },
      teamAccess,
    });
    c.get("log").set(apiKeyAuthLogContext(keyRecord));

    await next();
  },
);

/**
 * Runtime gate for `/api/v1/*`. Effective access is the intersection of the
 * token's stored scopes and the owner's current role. `api_keys:write` is a
 * session management capability, not a token scope — it never grants broader
 * public-API access here.
 */
export function requireApiKeyPermission(permission: string) {
  return createMiddleware<{ Variables: ApiKeyAuthVariables }>(async (c, next) => {
    const auth = c.get("auth");

    if (!auth) {
      return unauthorizedResponse(c, "unauthorized", "Authentication required");
    }

    if (
      !auth.apiKey.permissions.includes(permission) ||
      !ownerCanExerciseApiKeyPermission(auth.teamAccess.membership.role, permission)
    ) {
      return forbiddenResponse(c, "forbidden", `Missing required permission: ${permission}`);
    }

    await next();
  });
}
