import { randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

import { type AuthVariables, workosAuthMiddleware } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

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

async function ensureInboundAlias(input: {
  organizationId: string;
  organizationSlug: string | null | undefined;
}) {
  const aliasBase = normalizeSlug(input.organizationSlug);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const alias = generateInboundAlias(aliasBase);

    try {
      const [organization] = await db
        .update(schema.organizations)
        .set({
          emailAgentEnabled: true,
          inboundEmailAlias: alias,
        })
        .where(
          and(
            eq(schema.organizations.id, input.organizationId),
            isNull(schema.organizations.inboundEmailAlias),
          ),
        )
        .returning({
          emailAgentEnabled: schema.organizations.emailAgentEnabled,
          inboundEmailAlias: schema.organizations.inboundEmailAlias,
        });

      if (organization) {
        return organization;
      }

      const [existing] = await db
        .select({
          emailAgentEnabled: schema.organizations.emailAgentEnabled,
          inboundEmailAlias: schema.organizations.inboundEmailAlias,
        })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, input.organizationId))
        .limit(1);

      if (existing) {
        return existing;
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
      const [organization] = await db
        .select({
          emailAgentEnabled: schema.organizations.emailAgentEnabled,
          inboundEmailAlias: schema.organizations.inboundEmailAlias,
        })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, c.var.auth.organization.localOrganizationId))
        .limit(1);

      if (!organization) {
        return c.json({ error: "organization_not_found" as const }, 404);
      }

      return c.json(
        {
          emailAgent: {
            enabled: organization.emailAgentEnabled,
            inboundEmailAddress: asInboundAddress(
              organization.inboundEmailAlias,
              organization.emailAgentEnabled,
            ),
          },
        },
        200,
      );
    })
    .patch("/", validateUpdateEmailAgentBody, async (c) => {
      const payload = c.req.valid("json");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const organizationSlug = c.var.auth.organization.slug;

      if (payload.enabled) {
        const organization = await ensureInboundAlias({ organizationId, organizationSlug });

        if (!organization.emailAgentEnabled) {
          const [enabledOrganization] = await db
            .update(schema.organizations)
            .set({ emailAgentEnabled: true })
            .where(eq(schema.organizations.id, organizationId))
            .returning({
              emailAgentEnabled: schema.organizations.emailAgentEnabled,
              inboundEmailAlias: schema.organizations.inboundEmailAlias,
            });

          if (enabledOrganization) {
            return c.json(
              {
                emailAgent: {
                  enabled: enabledOrganization.emailAgentEnabled,
                  inboundEmailAddress: asInboundAddress(
                    enabledOrganization.inboundEmailAlias,
                    enabledOrganization.emailAgentEnabled,
                  ),
                },
              },
              200,
            );
          }
        }

        return c.json(
          {
            emailAgent: {
              enabled: organization.emailAgentEnabled,
              inboundEmailAddress: asInboundAddress(
                organization.inboundEmailAlias,
                organization.emailAgentEnabled,
              ),
            },
          },
          200,
        );
      }

      const [organization] = await db
        .update(schema.organizations)
        .set({ emailAgentEnabled: false })
        .where(eq(schema.organizations.id, organizationId))
        .returning({
          emailAgentEnabled: schema.organizations.emailAgentEnabled,
          inboundEmailAlias: schema.organizations.inboundEmailAlias,
        });

      if (!organization) {
        return c.json({ error: "organization_not_found" as const }, 404);
      }

      return c.json(
        {
          emailAgent: {
            enabled: organization.emailAgentEnabled,
            inboundEmailAddress: asInboundAddress(
              organization.inboundEmailAlias,
              organization.emailAgentEnabled,
            ),
          },
        },
        200,
      );
    });
}

export const agentEmailRoutes = createAgentEmailRoutes();
