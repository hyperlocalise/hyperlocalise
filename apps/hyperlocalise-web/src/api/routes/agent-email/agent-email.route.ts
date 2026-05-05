import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

import { type AuthVariables, workosAuthMiddleware } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { assertProviderCredentialAdmin } from "@/lib/providers/organization-provider-credentials";

const inboundEmailDomain = "inbox.hyperlocalise.com";

const updateEmailAgentBodySchema = z.object({
  enabled: z.boolean(),
});

function normalizeSlug(value: string | null | undefined) {
  const normalized = (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);

  return normalized || "org";
}

function generateInboundAlias(slug: string) {
  return `${normalizeSlug(slug)}-${randomBytes(3).toString("hex")}`;
}

function asInboundAddress(alias: string | null, enabled: boolean) {
  if (!enabled || !alias) {
    return null;
  }

  return `${alias}@${inboundEmailDomain}`;
}

const validateUpdateEmailAgentBody = validator("json", (value, c) => {
  const parsed = updateEmailAgentBodySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_email_agent_payload" as const }, 400);
  }

  return parsed.data;
});

async function getEmailConnector(organizationId: string) {
  const [connector] = await db
    .select()
    .from(schema.connectors)
    .where(
      and(
        eq(schema.connectors.organizationId, organizationId),
        eq(schema.connectors.kind, "email"),
      ),
    )
    .limit(1);

  return connector ?? null;
}

async function ensureInboundAlias(input: {
  organizationId: string;
  organizationSlug: string | null | undefined;
}) {
  const aliasBase = normalizeSlug(input.organizationSlug);

  const existing = await getEmailConnector(input.organizationId);
  if (existing) {
    const config = existing.config as { inboundEmailAlias?: string };
    if (config.inboundEmailAlias) {
      return existing;
    }
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const alias = generateInboundAlias(aliasBase);

    try {
      const [connector] = await db
        .insert(schema.connectors)
        .values({
          organizationId: input.organizationId,
          kind: "email",
          enabled: false,
          config: { inboundEmailAlias: alias },
        })
        .onConflictDoUpdate({
          target: [schema.connectors.organizationId, schema.connectors.kind],
          set: {
            config: { inboundEmailAlias: alias },
            updatedAt: new Date(),
          },
        })
        .returning();

      if (connector) {
        return connector;
      }
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("email_alias_generation_conflict");
}

export function createAgentEmailRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const connector = await getEmailConnector(c.var.auth.organization.localOrganizationId);

      const enabled = connector?.enabled ?? false;
      const config = (connector?.config ?? {}) as { inboundEmailAlias?: string };

      return c.json(
        {
          emailAgent: {
            enabled,
            inboundEmailAddress: asInboundAddress(config.inboundEmailAlias ?? null, enabled),
          },
        },
        200,
      );
    })
    .patch("/", validateUpdateEmailAgentBody, async (c) => {
      const payload = c.req.valid("json");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const organizationSlug = c.var.auth.organization.slug;

      try {
        assertProviderCredentialAdmin(c.var.auth.membership.role);
      } catch {
        return c.json({ error: "forbidden" as const }, 403);
      }

      if (payload.enabled) {
        const connectorWithAlias = await ensureInboundAlias({
          organizationId,
          organizationSlug,
        });

        if (!connectorWithAlias) {
          return c.json({ error: "organization_not_found" as const }, 404);
        }

        const [connector] = await db
          .update(schema.connectors)
          .set({ enabled: true, updatedAt: new Date() })
          .where(
            and(
              eq(schema.connectors.organizationId, organizationId),
              eq(schema.connectors.kind, "email"),
            ),
          )
          .returning();

        if (!connector) {
          return c.json({ error: "organization_not_found" as const }, 404);
        }

        const config = (connector.config ?? {}) as { inboundEmailAlias?: string };

        return c.json(
          {
            emailAgent: {
              enabled: connector.enabled,
              inboundEmailAddress: asInboundAddress(
                config.inboundEmailAlias ?? null,
                connector.enabled,
              ),
            },
          },
          200,
        );
      }

      const [connector] = await db
        .update(schema.connectors)
        .set({ enabled: false, updatedAt: new Date() })
        .where(
          and(
            eq(schema.connectors.organizationId, organizationId),
            eq(schema.connectors.kind, "email"),
          ),
        )
        .returning();

      if (!connector) {
        return c.json({ error: "organization_not_found" as const }, 404);
      }

      const config = (connector.config ?? {}) as { inboundEmailAlias?: string };

      return c.json(
        {
          emailAgent: {
            enabled: connector.enabled,
            inboundEmailAddress: asInboundAddress(
              config.inboundEmailAlias ?? null,
              connector.enabled,
            ),
          },
        },
        200,
      );
    });
}
