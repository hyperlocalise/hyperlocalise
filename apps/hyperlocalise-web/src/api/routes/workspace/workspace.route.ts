import { and, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { validator } from "hono/validator";

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
  validationErrorResponse,
} from "@/api/errors";
import { db, schema } from "@/lib/database";
import { activeOrganizationCookieName } from "@/lib/workos/active-organization";
import { getWorkosServerClient } from "@/lib/workos/server-client";

import { updateWorkspaceBodySchema } from "./workspace.schema";

const validateUpdateWorkspaceBody = validator("json", (value, c) => {
  const parsed = updateWorkspaceBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_workspace_payload",
      "Workspace payload is invalid",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

function canUpdateWorkspace(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "workspace:update");
}

function toWorkspaceResponse(row: {
  id: string;
  workosOrganizationId: string;
  name: string;
  slug: string | null;
  lifecycleStatus: "active" | "archived" | "deprecated";
  archivedAt: Date | null;
}) {
  return {
    id: row.id,
    workosOrganizationId: row.workosOrganizationId,
    name: row.name,
    slug: row.slug,
    lifecycleStatus: row.lifecycleStatus,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    identityProvider: "workos",
  };
}

async function updateWorkosOrganizationName(input: { workosOrganizationId: string; name: string }) {
  const workos = getWorkosServerClient();
  if (!workos) {
    return { ok: false as const };
  }

  try {
    await workos.organizations.updateOrganization({
      organization: input.workosOrganizationId,
      name: input.name,
    });
  } catch {
    return { ok: false as const };
  }

  return { ok: true as const };
}

function storeActiveOrganizationSlug(c: Parameters<typeof setCookie>[0], slug: string) {
  setCookie(c, activeOrganizationCookieName, slug, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function createWorkspaceRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const [organization] = await db
        .select({
          id: schema.organizations.id,
          workosOrganizationId: schema.organizations.workosOrganizationId,
          name: schema.organizations.name,
          slug: schema.organizations.slug,
          lifecycleStatus: schema.organizations.lifecycleStatus,
          archivedAt: schema.organizations.archivedAt,
        })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, c.var.auth.activeOrganization.localOrganizationId))
        .limit(1);

      if (!organization) {
        return notFoundResponse(c, "workspace_not_found", "Workspace not found");
      }

      return c.json({ workspace: toWorkspaceResponse(organization) }, 200);
    })
    .patch("/", validateUpdateWorkspaceBody, async (c) => {
      if (!canUpdateWorkspace(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden", "Only workspace admins can update settings");
      }

      const payload = c.req.valid("json");
      const organizationId = c.var.auth.activeOrganization.localOrganizationId;
      const currentSlug = c.var.auth.activeOrganization.slug;

      if (payload.slug && payload.slug !== currentSlug) {
        const [conflictingOrganization] = await db
          .select({ id: schema.organizations.id })
          .from(schema.organizations)
          .where(
            and(
              eq(schema.organizations.slug, payload.slug),
              ne(schema.organizations.id, organizationId),
            ),
          )
          .limit(1);

        if (conflictingOrganization) {
          return conflictResponse(c, "workspace_slug_conflict", "Workspace slug already exists");
        }
      }

      const [existingOrganization] = await db
        .select({
          id: schema.organizations.id,
          workosOrganizationId: schema.organizations.workosOrganizationId,
          lifecycleStatus: schema.organizations.lifecycleStatus,
        })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, organizationId))
        .limit(1);

      if (!existingOrganization || existingOrganization.lifecycleStatus !== "active") {
        return notFoundResponse(c, "workspace_not_found", "Workspace not found");
      }

      if (payload.name) {
        const workosResult = await updateWorkosOrganizationName({
          workosOrganizationId: existingOrganization.workosOrganizationId,
          name: payload.name,
        });

        if (!workosResult.ok) {
          return internalErrorResponse(
            c,
            "workspace_identity_unavailable",
            "WorkOS organization identity is unavailable",
          );
        }
      }

      const [updatedOrganization] = await db
        .update(schema.organizations)
        .set({
          ...(payload.name ? { name: payload.name } : {}),
          ...(payload.slug ? { slug: payload.slug } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.organizations.id, organizationId),
            eq(schema.organizations.lifecycleStatus, "active"),
          ),
        )
        .returning({
          id: schema.organizations.id,
          workosOrganizationId: schema.organizations.workosOrganizationId,
          name: schema.organizations.name,
          slug: schema.organizations.slug,
          lifecycleStatus: schema.organizations.lifecycleStatus,
          archivedAt: schema.organizations.archivedAt,
        });

      if (!updatedOrganization) {
        return notFoundResponse(c, "workspace_not_found", "Workspace not found");
      }

      if (!updatedOrganization.slug) {
        return badRequestResponse(c, "workspace_missing_slug", "Workspace slug is required");
      }

      storeActiveOrganizationSlug(c, updatedOrganization.slug);

      return c.json(
        {
          workspace: toWorkspaceResponse(updatedOrganization),
          redirectTo: `/org/${updatedOrganization.slug}/settings/account`,
        },
        200,
      );
    })
    .delete("/", async (c) => {
      if (!canUpdateWorkspace(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden", "Only workspace admins can archive workspaces");
      }

      const archivedAt = new Date();
      const [archivedOrganization] = await db
        .update(schema.organizations)
        .set({
          lifecycleStatus: "archived",
          archivedAt,
          updatedAt: archivedAt,
        })
        .where(
          and(
            eq(schema.organizations.id, c.var.auth.activeOrganization.localOrganizationId),
            eq(schema.organizations.lifecycleStatus, "active"),
          ),
        )
        .returning({
          id: schema.organizations.id,
          workosOrganizationId: schema.organizations.workosOrganizationId,
          name: schema.organizations.name,
          slug: schema.organizations.slug,
          lifecycleStatus: schema.organizations.lifecycleStatus,
          archivedAt: schema.organizations.archivedAt,
        });

      if (!archivedOrganization) {
        return notFoundResponse(c, "workspace_not_found", "Workspace not found");
      }

      return c.body(null, 204);
    });
}

export const workspaceRoutes = createWorkspaceRoutes();
