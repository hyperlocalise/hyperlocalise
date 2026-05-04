import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { generateApiKey, getApiKeyPrefix, hashApiKey } from "@/lib/api-keys";
import { z } from "zod";

const createApiKeyBodySchema = z.object({
  name: z.string().trim().min(1).max(128),
  permissions: z.array(z.enum(["jobs:read", "jobs:write"])).optional(),
});

const apiKeyIdParamsSchema = z.object({
  organizationSlug: z.string().trim().min(1),
  apiKeyId: z.string().trim().min(1),
});

function invalidPayloadResponse(c: { json(body: { error: string }, status: 400): Response }) {
  return c.json({ error: "invalid_api_key_payload" }, 400);
}

function apiKeyNotFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "api_key_not_found" }, 404);
}

const validateCreateApiKeyBody = validator("json", (value, c) => {
  const parsed = createApiKeyBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidPayloadResponse(c);
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
      // Only owners and admins can create API keys
      if (!["owner", "admin"].includes(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
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
          permissions: payload.permissions ?? ["jobs:read", "jobs:write"],
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
      if (!["owner", "admin"].includes(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const params = c.req.valid("param");
      const [existing] = await db
        .select({ id: schema.organizationApiKeys.id })
        .from(schema.organizationApiKeys)
        .where(
          and(
            eq(schema.organizationApiKeys.id, params.apiKeyId),
            eq(
              schema.organizationApiKeys.organizationId,
              c.var.auth.organization.localOrganizationId,
            ),
          ),
        )
        .limit(1);

      if (!existing) {
        return apiKeyNotFoundResponse(c);
      }

      await db
        .update(schema.organizationApiKeys)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.organizationApiKeys.id, params.apiKeyId),
            eq(
              schema.organizationApiKeys.organizationId,
              c.var.auth.organization.localOrganizationId,
            ),
          ),
        );

      return c.body(null, 204);
    });
}

export const apiKeyRoutes = createApiKeyRoutes();
