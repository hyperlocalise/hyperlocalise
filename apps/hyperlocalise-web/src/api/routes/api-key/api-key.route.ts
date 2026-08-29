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
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { apiErrorResponse } from "@/api/response.schema";
import { db, schema } from "@/lib/database/client";
import { generateApiKey, getApiKeyPrefix, hashApiKey } from "@/lib/security/api-keys";

import { getGrantableApiKeyPermissions, getRefusedApiKeyPermissions } from "./api-key.permissions";
import { apiKeyIdParamsSchema, createApiKeyBodySchema } from "./api-key.schema";
import {
  apiKeyNotFoundResponse,
  apiKeyOwnerColumns,
  invalidApiKeyPayloadResponse,
  revocableApiKeyWhere,
  toApiKeyOwner,
  visibleApiKeysWhere,
} from "./api-key.shared";

const validateCreateApiKeyBody = validator("json", (value, c) => {
  const parsed = createApiKeyBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidApiKeyPayloadResponse(c, parsed.error.issues);
  }
  return parsed.data;
});

const validateApiKeyIdParams = validator("param", (value, c) => {
  const parsed = apiKeyIdParamsSchema.safeParse(value);
  if (!parsed.success) {
    return apiKeyNotFoundResponse(c);
  }
  return parsed.data;
});

export function createApiKeyRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const rows = await db
        .select({
          id: schema.organizationApiKeys.id,
          name: schema.organizationApiKeys.name,
          keyPrefix: schema.organizationApiKeys.keyPrefix,
          permissions: schema.organizationApiKeys.permissions,
          lastUsedAt: schema.organizationApiKeys.lastUsedAt,
          revokedAt: schema.organizationApiKeys.revokedAt,
          createdAt: schema.organizationApiKeys.createdAt,
          updatedAt: schema.organizationApiKeys.updatedAt,
          ...apiKeyOwnerColumns,
        })
        .from(schema.organizationApiKeys)
        .leftJoin(schema.users, eq(schema.organizationApiKeys.createdByUserId, schema.users.id))
        .where(visibleApiKeysWhere(c.var.auth))
        .orderBy(schema.organizationApiKeys.createdAt);

      const apiKeys = rows.map((row) => {
        const owner = toApiKeyOwner(row);

        return {
          id: row.id,
          name: row.name,
          keyPrefix: row.keyPrefix,
          permissions: row.permissions,
          lastUsedAt: row.lastUsedAt,
          // A token whose owner cannot be resolved is permanently unusable, so
          // it must never read as active. `updatedAt` is the fallback when
          // `revokedAt` was never written (legacy unowned rows, or a later
          // user deletion that nulls the owner).
          revokedAt: owner ? row.revokedAt : (row.revokedAt ?? row.updatedAt),
          createdAt: row.createdAt,
          owner,
        };
      });

      return c.json({ apiKeys }, 200);
    })
    .post("/", validateCreateApiKeyBody, async (c) => {
      // Any active member may create a token. Scopes are capped by the owner's
      // current role; a token cannot exceed what that role can already do.
      const payload = c.req.valid("json");
      const grantable = getGrantableApiKeyPermissions(c.var.auth.membership.role);
      const requested = payload.permissions ?? grantable;
      const refused = getRefusedApiKeyPermissions(c.var.auth.membership.role, requested);

      if (grantable.length === 0 || refused.length > 0) {
        return apiErrorResponse(
          c,
          403,
          "api_key_permissions_not_grantable",
          "Requested API key permissions exceed the owner's role",
          { permissions: refused.length > 0 ? refused : requested },
        );
      }

      const plainKey = generateApiKey();
      const keyHash = hashApiKey(plainKey);
      const keyPrefix = getApiKeyPrefix(plainKey);

      // The owner is always the authenticated user; the route accepts no owner
      // parameter, so nobody can mint a token that acts as somebody else.
      const [[apiKey], [ownerRow]] = await Promise.all([
        db
          .insert(schema.organizationApiKeys)
          .values({
            organizationId: c.var.auth.organization.localOrganizationId,
            name: payload.name,
            keyHash,
            keyPrefix,
            permissions: requested,
            createdByUserId: c.var.auth.user.localUserId,
          })
          .returning({
            id: schema.organizationApiKeys.id,
            name: schema.organizationApiKeys.name,
            keyPrefix: schema.organizationApiKeys.keyPrefix,
            permissions: schema.organizationApiKeys.permissions,
            createdAt: schema.organizationApiKeys.createdAt,
          }),
        db
          .select(apiKeyOwnerColumns)
          .from(schema.users)
          .where(eq(schema.users.id, c.var.auth.user.localUserId))
          .limit(1),
      ]);

      return c.json(
        {
          apiKey: {
            ...apiKey,
            key: plainKey,
            owner: ownerRow ? toApiKeyOwner(ownerRow) : null,
          },
        },
        201,
      );
    })
    .delete("/:apiKeyId", validateApiKeyIdParams, async (c) => {
      const params = c.req.valid("param");
      // Authorization lives in the predicate: owners always match their own
      // token, administrators match any token in the organization, and anyone
      // else matches nothing and gets the same 404 as an unknown id.
      const revocable = revocableApiKeyWhere(c.var.auth, params.apiKeyId);

      const [existing] = await db
        .select({
          id: schema.organizationApiKeys.id,
          revokedAt: schema.organizationApiKeys.revokedAt,
        })
        .from(schema.organizationApiKeys)
        .where(revocable)
        .limit(1);

      if (!existing) {
        return apiKeyNotFoundResponse(c);
      }

      if (existing.revokedAt) {
        return c.body(null, 204);
      }

      // `isNull` keeps the first revocation timestamp intact when two revokes race.
      await db
        .update(schema.organizationApiKeys)
        .set({ revokedAt: new Date() })
        .where(and(revocable, isNull(schema.organizationApiKeys.revokedAt)));

      return c.body(null, 204);
    });
}
