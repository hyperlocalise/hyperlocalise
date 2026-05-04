import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import { db, schema } from "@/lib/database";

export type ApiKeyAuthVariables = {
  auth: {
    organization: {
      localOrganizationId: string;
      name: string;
    };
    apiKey: {
      id: string;
      permissions: string[];
    };
  };
};

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export const apiKeyAuthMiddleware = createMiddleware<{ Variables: ApiKeyAuthVariables }>(
  async (c, next) => {
    const apiKey = c.req.header("x-api-key");

    if (!apiKey) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const keyHash = hashApiKey(apiKey);

    const [keyRecord] = await db
      .select({
        id: schema.organizationApiKeys.id,
        organizationId: schema.organizationApiKeys.organizationId,
        name: schema.organizationApiKeys.name,
        permissions: schema.organizationApiKeys.permissions,
        revokedAt: schema.organizationApiKeys.revokedAt,
      })
      .from(schema.organizationApiKeys)
      .where(eq(schema.organizationApiKeys.keyHash, keyHash))
      .limit(1);

    if (!keyRecord || keyRecord.revokedAt) {
      return c.json({ error: "unauthorized" }, 401);
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
        name: keyRecord.name,
      },
      apiKey: {
        id: keyRecord.id,
        permissions: keyRecord.permissions,
      },
    });

    await next();
  },
);

export function requireApiKeyPermission(permission: string) {
  return createMiddleware<{ Variables: ApiKeyAuthVariables }>(async (c, next) => {
    const auth = c.get("auth");

    if (!auth) {
      return c.json({ error: "unauthorized" }, 401);
    }

    if (!auth.apiKey.permissions.includes(permission)) {
      return c.json({ error: "forbidden" }, 403);
    }

    await next();
  });
}
