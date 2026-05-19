import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { generateApiKey, getApiKeyPrefix, hashApiKey } from "@/lib/api-keys";

import {
  apiKeyIdParamsSchema,
  createApiKeyBodySchema,
  defaultApiKeyPermissions,
} from "./api-key.schema";
import {
  apiKeyNotFoundResponse,
  forbiddenResponse,
  invalidApiKeyPayloadResponse,
  isApiKeyMutationAllowed,
  ownedApiKeyWhere,
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
      if (!isApiKeyMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const keys = await db
        .select({
          id: schema.organizationApiKeys.id,
          name: schema.organizationApiKeys.name,
          keyPrefix: schema.organizationApiKeys.keyPrefix,
          permissions: schema.organizationApiKeys.permissions,
          lastUsedAt: schema.organizationApiKeys.lastUsedAt,
          revokedAt: schema.organizationApiKeys.revokedAt,
          createdAt: schema.organizationApiKeys.createdAt,
        })
        .from(schema.organizationApiKeys)
        .where(
          eq(
            schema.organizationApiKeys.organizationId,
            c.var.auth.organization.localOrganizationId,
          ),
        )
        .orderBy(schema.organizationApiKeys.createdAt);

      return c.json({ apiKeys: keys }, 200);
    })
    .post("/", validateCreateApiKeyBody, async (c) => {
      if (!isApiKeyMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const plainKey = generateApiKey();
      const keyHash = hashApiKey(plainKey);
      const keyPrefix = getApiKeyPrefix(plainKey);

      const [apiKey] = await db
        .insert(schema.organizationApiKeys)
        .values({
          organizationId: c.var.auth.organization.localOrganizationId,
          name: payload.name,
          keyHash,
          keyPrefix,
          permissions: payload.permissions ?? [...defaultApiKeyPermissions],
          createdByUserId: c.var.auth.user.localUserId,
        })
        .returning({
          id: schema.organizationApiKeys.id,
          name: schema.organizationApiKeys.name,
          keyPrefix: schema.organizationApiKeys.keyPrefix,
          permissions: schema.organizationApiKeys.permissions,
          createdAt: schema.organizationApiKeys.createdAt,
        });

      return c.json({ apiKey: { ...apiKey, key: plainKey } }, 201);
    })
    .delete("/:apiKeyId", validateApiKeyIdParams, async (c) => {
      if (!isApiKeyMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const [existing] = await db
        .select({ id: schema.organizationApiKeys.id })
        .from(schema.organizationApiKeys)
        .where(ownedApiKeyWhere(c.var.auth, params.apiKeyId))
        .limit(1);

      if (!existing) {
        return apiKeyNotFoundResponse(c);
      }

      await db
        .update(schema.organizationApiKeys)
        .set({ revokedAt: new Date() })
        .where(ownedApiKeyWhere(c.var.auth, params.apiKeyId));

      return c.body(null, 204);
    });
}
