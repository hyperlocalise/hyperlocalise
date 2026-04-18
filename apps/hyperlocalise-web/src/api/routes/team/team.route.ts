import { and, count, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

import { workosAuthMiddleware, type AuthVariables, type ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import type { TeamMembershipRole } from "@/lib/database/types";

const teamRoleSchema = z.enum(["manager", "member"]);
const createTeamBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});
const updateTeamBodySchema = createTeamBodySchema
  .partial()
  .refine((value) => value.name !== undefined || value.slug !== undefined);
const addTeamMemberBodySchema = z.object({
  workosUserId: z.string().trim().min(1),
  role: teamRoleSchema.optional(),
});
const teamIdParamsSchema = z.object({
  teamId: z.string().uuid(),
});
const teamMemberParamsSchema = z.object({
  teamId: z.string().uuid(),
  workosUserId: z.string().min(1),
});

function slugifyTeamName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function forbiddenResponse(c: { json(body: { error: string }, status: 403): Response }) {
  return c.json({ error: "forbidden" }, 403);
}

function teamNotFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "team_not_found" }, 404);
}

function invalidTeamPayloadResponse(c: { json(body: { error: string }, status: 400): Response }) {
  return c.json({ error: "invalid_team_payload" }, 400);
}

function isOrganizationAdmin(auth: ApiAuthContext) {
  return auth.membership.role === "owner" || auth.membership.role === "admin";
}

async function getVisibleTeamIds(auth: ApiAuthContext) {
  if (isOrganizationAdmin(auth)) {
    const teams = await db
      .select({ id: schema.teams.id })
      .from(schema.teams)
      .where(eq(schema.teams.organizationId, auth.activeOrganization.localOrganizationId));

    return teams.map((team) => team.id);
  }

  const teams = await db
    .select({ id: schema.teams.id })
    .from(schema.teamMemberships)
    .innerJoin(schema.teams, eq(schema.teamMemberships.teamId, schema.teams.id))
    .where(
      and(
        eq(schema.teamMemberships.userId, auth.user.localUserId),
        eq(schema.teams.organizationId, auth.activeOrganization.localOrganizationId),
      ),
    );

  return teams.map((team) => team.id);
}

async function getAccessibleTeam(
  auth: ApiAuthContext,
  teamId: string,
): Promise<{
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  const [team] = await db
    .select()
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.id, teamId),
        eq(schema.teams.organizationId, auth.activeOrganization.localOrganizationId),
      ),
    )
    .limit(1);

  if (!team) {
    return null;
  }

  if (isOrganizationAdmin(auth)) {
    return team;
  }

  const [membership] = await db
    .select({ id: schema.teamMemberships.id })
    .from(schema.teamMemberships)
    .where(
      and(
        eq(schema.teamMemberships.teamId, teamId),
        eq(schema.teamMemberships.userId, auth.user.localUserId),
      ),
    )
    .limit(1);

  return membership ? team : null;
}

const validateCreateTeamBody = validator("json", (value, c) => {
  const parsed = createTeamBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidTeamPayloadResponse(c);
  }

  return parsed.data;
});

const validateUpdateTeamBody = validator("json", (value, c) => {
  const parsed = updateTeamBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidTeamPayloadResponse(c);
  }

  return parsed.data;
});

const validateAddTeamMemberBody = validator("json", (value, c) => {
  const parsed = addTeamMemberBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidTeamPayloadResponse(c);
  }

  return parsed.data;
});

const validateTeamParams = validator("param", (value, c) => {
  const parsed = teamIdParamsSchema.safeParse(value);
  if (!parsed.success) {
    return teamNotFoundResponse(c);
  }

  return parsed.data;
});

const validateTeamMemberParams = validator("param", (value, c) => {
  const parsed = teamMemberParamsSchema.safeParse(value);
  if (!parsed.success) {
    return teamNotFoundResponse(c);
  }

  return parsed.data;
});

export function createTeamRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const visibleTeamIds = await getVisibleTeamIds(c.var.auth);
      if (visibleTeamIds.length === 0) {
        return c.json({ teams: [] }, 200);
      }

      const teams = await db
        .select({
          id: schema.teams.id,
          slug: schema.teams.slug,
          name: schema.teams.name,
          createdAt: schema.teams.createdAt,
          updatedAt: schema.teams.updatedAt,
          memberCount: count(schema.teamMemberships.id),
        })
        .from(schema.teams)
        .leftJoin(schema.teamMemberships, eq(schema.teamMemberships.teamId, schema.teams.id))
        .where(
          and(
            eq(schema.teams.organizationId, c.var.auth.activeOrganization.localOrganizationId),
            inArray(schema.teams.id, visibleTeamIds),
          ),
        )
        .groupBy(schema.teams.id)
        .orderBy(desc(schema.teams.createdAt));

      return c.json({ teams }, 200);
    })
    .post("/", validateCreateTeamBody, async (c) => {
      if (!isOrganizationAdmin(c.var.auth)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const [team] = await db
        .insert(schema.teams)
        .values({
          organizationId: c.var.auth.activeOrganization.localOrganizationId,
          name: payload.name,
          slug: payload.slug ?? slugifyTeamName(payload.name),
        })
        .returning();

      await db.insert(schema.teamMemberships).values({
        teamId: team.id,
        userId: c.var.auth.user.localUserId,
        role: "manager",
      });

      return c.json({ team }, 201);
    })
    .get("/:teamId", validateTeamParams, async (c) => {
      const { teamId } = c.req.valid("param");
      const team = await getAccessibleTeam(c.var.auth, teamId);

      if (!team) {
        return teamNotFoundResponse(c);
      }

      const members = await db
        .select({
          workosUserId: schema.users.workosUserId,
          email: schema.users.email,
          role: schema.teamMemberships.role,
        })
        .from(schema.teamMemberships)
        .innerJoin(schema.users, eq(schema.teamMemberships.userId, schema.users.id))
        .where(eq(schema.teamMemberships.teamId, team.id));

      return c.json({ team: { ...team, members } }, 200);
    })
    .patch("/:teamId", validateTeamParams, validateUpdateTeamBody, async (c) => {
      if (!isOrganizationAdmin(c.var.auth)) {
        return forbiddenResponse(c);
      }

      const { teamId } = c.req.valid("param");
      const payload = c.req.valid("json");
      const [team] = await db
        .update(schema.teams)
        .set({
          name: payload.name,
          slug: payload.slug,
        })
        .where(
          and(
            eq(schema.teams.id, teamId),
            eq(schema.teams.organizationId, c.var.auth.activeOrganization.localOrganizationId),
          ),
        )
        .returning();

      if (!team) {
        return teamNotFoundResponse(c);
      }

      return c.json({ team }, 200);
    })
    .post("/:teamId/members", validateTeamParams, validateAddTeamMemberBody, async (c) => {
      if (!isOrganizationAdmin(c.var.auth)) {
        return forbiddenResponse(c);
      }

      const { teamId } = c.req.valid("param");
      const payload = c.req.valid("json");
      const team = await getAccessibleTeam(c.var.auth, teamId);

      if (!team) {
        return teamNotFoundResponse(c);
      }

      const [user] = await db
        .select({
          id: schema.users.id,
          workosUserId: schema.users.workosUserId,
          email: schema.users.email,
        })
        .from(schema.users)
        .innerJoin(
          schema.organizationMemberships,
          eq(schema.organizationMemberships.userId, schema.users.id),
        )
        .where(
          and(
            eq(schema.users.workosUserId, payload.workosUserId),
            eq(
              schema.organizationMemberships.organizationId,
              c.var.auth.activeOrganization.localOrganizationId,
            ),
          ),
        )
        .limit(1);

      if (!user) {
        return c.json({ error: "organization_member_not_found" }, 404);
      }

      const [teamMembership] = await db
        .insert(schema.teamMemberships)
        .values({
          teamId: team.id,
          userId: user.id,
          role: (payload.role ?? "member") as TeamMembershipRole,
        })
        .onConflictDoUpdate({
          target: [schema.teamMemberships.teamId, schema.teamMemberships.userId],
          set: { role: payload.role ?? "member" },
        })
        .returning({
          role: schema.teamMemberships.role,
        });

      return c.json(
        {
          member: {
            workosUserId: user.workosUserId,
            email: user.email,
            role: teamMembership.role,
          },
        },
        201,
      );
    })
    .delete("/:teamId/members/:workosUserId", validateTeamMemberParams, async (c) => {
      if (!isOrganizationAdmin(c.var.auth)) {
        return forbiddenResponse(c);
      }

      const { teamId, workosUserId } = c.req.valid("param");
      const team = await getAccessibleTeam(c.var.auth, teamId);

      if (!team) {
        return teamNotFoundResponse(c);
      }

      const [user] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.workosUserId, workosUserId))
        .limit(1);

      if (!user) {
        return c.body(null, 204);
      }

      await db
        .delete(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.teamId, team.id),
            eq(schema.teamMemberships.userId, user.id),
          ),
        );

      return c.body(null, 204);
    });
}
