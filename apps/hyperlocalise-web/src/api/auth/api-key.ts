import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { EvlogVariables } from "evlog/hono";

import { resolveApiKeyTeamAccessContext } from "@/api/auth/api-key-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { forbiddenResponse, unauthorizedResponse } from "@/api/errors";
import { db, schema } from "@/lib/database";

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

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
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

    if (!keyRecord || keyRecord.revokedAt) {
      return unauthorizedResponse(c, "unauthorized", "Invalid or revoked API key");
    }

    if (keyRecord.lifecycleStatus !== "active") {
      return forbiddenResponse(c, "workspace_archived", "This workspace has been archived");
    }

    const teamAccess = await resolveApiKeyTeamAccessContext({
      organizationId: keyRecord.organizationId,
      createdByUserId: keyRecord.createdByUserId,
    });

    if (!teamAccess) {
      return forbiddenResponse(c, "forbidden", "API key creator is not authorized for this workspace");
    }

    // Update lastUsedAt asynchronously — don't block the request.
    db.update(schema.organizationApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.organizationApiKeys.id, keyRecord.id))
      .execute()
      .catch(() => {});

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
    c.get("log").set({
      auth: {
        apiKeyId: keyRecord.id,
        localOrganizationId: keyRecord.organizationId,
      },
    });

    await next();
  },
);

export function requireApiKeyPermission(permission: string) {
  return createMiddleware<{ Variables: ApiKeyAuthVariables }>(async (c, next) => {
    const auth = c.get("auth");

    if (!auth) {
      return unauthorizedResponse(c, "unauthorized", "Authentication required");
    }

    if (!auth.apiKey.permissions.includes(permission)) {
      return forbiddenResponse(c, "forbidden", `Missing required permission: ${permission}`);
    }

    await next();
  });
}
