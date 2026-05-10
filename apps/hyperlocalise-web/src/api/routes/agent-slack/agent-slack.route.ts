import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

import { type AuthVariables, workosAuthMiddleware } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { assertProviderCredentialAdmin } from "@/lib/providers/organization-provider-credentials";

const updateSlackAgentBodySchema = z.object({
  enabled: z.boolean(),
});

const validateUpdateSlackAgentBody = validator("json", (value, c) => {
  const parsed = updateSlackAgentBodySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_slack_agent_payload" as const }, 400);
  }

  return parsed.data;
});

async function getSlackConnector(organizationId: string) {
  const [connector] = await db
    .select()
    .from(schema.connectors)
    .where(
      and(
        eq(schema.connectors.organizationId, organizationId),
        eq(schema.connectors.kind, "slack"),
      ),
    )
    .limit(1);

  return connector ?? null;
}

export function createAgentSlackRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const connector = await getSlackConnector(c.var.auth.organization.localOrganizationId);

      const enabled = connector?.enabled ?? false;
      const config = (connector?.config ?? {}) as { teamId?: string; teamName?: string };

      return c.json(
        {
          slackAgent: {
            enabled,
            teamId: config.teamId ?? null,
            teamName: config.teamName ?? null,
          },
        },
        200,
      );
    })
    .patch("/", validateUpdateSlackAgentBody, async (c) => {
      const payload = c.req.valid("json");
      const organizationId = c.var.auth.organization.localOrganizationId;

      try {
        assertProviderCredentialAdmin(c.var.auth.membership.role);
      } catch {
        return c.json({ error: "forbidden" as const }, 403);
      }

      const [connector] = await db
        .insert(schema.connectors)
        .values({
          organizationId,
          kind: "slack",
          enabled: payload.enabled,
          config: {},
        })
        .onConflictDoUpdate({
          target: [schema.connectors.organizationId, schema.connectors.kind],
          set: {
            enabled: payload.enabled,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!connector) {
        return c.json({ error: "organization_not_found" as const }, 404);
      }

      const config = (connector.config ?? {}) as { teamId?: string; teamName?: string };

      return c.json(
        {
          slackAgent: {
            enabled: connector.enabled,
            teamId: config.teamId ?? null,
            teamName: config.teamName ?? null,
          },
        },
        200,
      );
    });
}
