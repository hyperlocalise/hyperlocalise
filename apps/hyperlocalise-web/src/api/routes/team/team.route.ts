import { and, count, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables, type ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import type { TeamMembershipRole } from "@/lib/database/types";

import {
  addTeamMemberBodySchema,
  createTeamBodySchema,
  teamIdParamsSchema,
  teamMemberParamsSchema,
  updateTeamBodySchema,
} from "./team.schema";
import { getVisibleTeamIds } from "@/api/auth/team-access";

import {
  canManageTeamMembership,
  forbiddenResponse,
  invalidTeamPayloadResponse,
  isOrganizationAdmin,
  isUniqueViolation,
  organizationMemberNotFoundResponse,
  slugifyTeamName,
  teamHasProjectsResponse,
  teamNotFoundResponse,
  teamSlugAlreadyExistsResponse,
} from "./team.shared";

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

      const currentUserMembership = db
        .select({
          teamId: schema.teamMemberships.teamId,
          role: schema.teamMemberships.role,
        })
        .from(schema.teamMemberships)
        .where(eq(schema.teamMemberships.userId, c.var.auth.user.localUserId))
        .as("current_user_membership");

      const teams = await db
        .select({
          id: schema.teams.id,
          slug: schema.teams.slug,
          name: schema.teams.name,
          createdAt: schema.teams.createdAt,
          updatedAt: schema.teams.updatedAt,
          memberCount: count(schema.teamMemberships.id),
          currentUserRole: currentUserMembership.role,
        })
        .from(schema.teams)
        .leftJoin(schema.teamMemberships, eq(schema.teamMemberships.teamId, schema.teams.id))
        .leftJoin(currentUserMembership, eq(currentUserMembership.teamId, schema.teams.id))
        .where(
          and(
            eq(schema.teams.organizationId, c.var.auth.activeOrganization.localOrganizationId),
            inArray(schema.teams.id, visibleTeamIds),
          ),
        )
        .groupBy(
          schema.teams.id,
          schema.teams.slug,
          schema.teams.name,
          schema.teams.createdAt,
          schema.teams.updatedAt,
          currentUserMembership.role,
        )
        .orderBy(desc(schema.teams.createdAt));

      return c.json({ teams }, 200);
    })
    .get("/member-directory", async (c) => {
      const members = await db
        .select({
          workosUserId: schema.users.workosUserId,
          email: schema.users.email,
        })
        .from(schema.users)
        .innerJoin(
          schema.organizationMemberships,
          eq(schema.organizationMemberships.userId, schema.users.id),
        )
        .where(
          eq(
            schema.organizationMemberships.organizationId,
            c.var.auth.activeOrganization.localOrganizationId,
          ),
        )
        .orderBy(schema.users.email);

      return c.json({ members }, 200);
    })
    .post("/", validateCreateTeamBody, async (c) => {
      if (!isOrganizationAdmin(c.var.auth)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      try {
        const team = await db.transaction(async (tx) => {
          const [createdTeam] = await tx
            .insert(schema.teams)
            .values({
              organizationId: c.var.auth.activeOrganization.localOrganizationId,
              name: payload.name,
              slug: payload.slug ?? slugifyTeamName(payload.name),
            })
            .returning();

          await tx.insert(schema.teamMemberships).values({
            teamId: createdTeam.id,
            userId: c.var.auth.user.localUserId,
            role: "manager",
          });

          return createdTeam;
        });

        return c.json({ team }, 201);
      } catch (error) {
        if (isUniqueViolation(error)) {
          return teamSlugAlreadyExistsResponse(c);
        }

        throw error;
      }
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
    .delete("/:teamId", validateTeamParams, async (c) => {
      if (!isOrganizationAdmin(c.var.auth)) {
        return forbiddenResponse(c);
      }

      const { teamId } = c.req.valid("param");
      const team = await getAccessibleTeam(c.var.auth, teamId);

      if (!team) {
        return teamNotFoundResponse(c);
      }

      const [projectUsingTeam] = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.teamId, team.id))
        .limit(1);

      if (projectUsingTeam) {
        return teamHasProjectsResponse(c);
      }

      await db
        .delete(schema.teams)
        .where(
          and(
            eq(schema.teams.id, teamId),
            eq(schema.teams.organizationId, c.var.auth.activeOrganization.localOrganizationId),
          ),
        );

      return c.body(null, 204);
    })
    .patch("/:teamId", validateTeamParams, validateUpdateTeamBody, async (c) => {
      if (!isOrganizationAdmin(c.var.auth)) {
        return forbiddenResponse(c);
      }

      const { teamId } = c.req.valid("param");
      const payload = c.req.valid("json");
      try {
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
      } catch (error) {
        if (isUniqueViolation(error)) {
          return teamSlugAlreadyExistsResponse(c);
        }

        throw error;
      }
    })
    .post("/:teamId/members", validateTeamParams, validateAddTeamMemberBody, async (c) => {
      const { teamId } = c.req.valid("param");
      const payload = c.req.valid("json");
      const team = await getAccessibleTeam(c.var.auth, teamId);

      if (!team) {
        return teamNotFoundResponse(c);
      }

      if (!(await canManageTeamMembership(c.var.auth, teamId))) {
        return forbiddenResponse(c);
      }

      const memberLookup = payload.workosUserId
        ? eq(schema.users.workosUserId, payload.workosUserId)
        : eq(schema.users.email, payload.email!);

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
            memberLookup,
            eq(
              schema.organizationMemberships.organizationId,
              c.var.auth.activeOrganization.localOrganizationId,
            ),
          ),
        )
        .limit(1);

      if (!user) {
        return organizationMemberNotFoundResponse(c);
      }

      const [teamMembership] =
        payload.role === undefined
          ? await db
              .insert(schema.teamMemberships)
              .values({
                teamId: team.id,
                userId: user.id,
                role: "member",
              })
              .onConflictDoNothing()
              .returning({
                role: schema.teamMemberships.role,
              })
          : await db
              .insert(schema.teamMemberships)
              .values({
                teamId: team.id,
                userId: user.id,
                role: payload.role as TeamMembershipRole,
              })
              .onConflictDoUpdate({
                target: [schema.teamMemberships.teamId, schema.teamMemberships.userId],
                set: { role: payload.role },
              })
              .returning({
                role: schema.teamMemberships.role,
              });

      const membership =
        teamMembership ??
        (
          await db
            .select({ role: schema.teamMemberships.role })
            .from(schema.teamMemberships)
            .where(
              and(
                eq(schema.teamMemberships.teamId, team.id),
                eq(schema.teamMemberships.userId, user.id),
              ),
            )
            .limit(1)
        )[0];

      return c.json(
        {
          member: {
            workosUserId: user.workosUserId,
            email: user.email,
            role: membership.role,
          },
        },
        201,
      );
    })
    .delete("/:teamId/members/:workosUserId", validateTeamMemberParams, async (c) => {
      const { teamId, workosUserId } = c.req.valid("param");
      const team = await getAccessibleTeam(c.var.auth, teamId);

      if (!team) {
        return teamNotFoundResponse(c);
      }

      if (!(await canManageTeamMembership(c.var.auth, teamId))) {
        return forbiddenResponse(c);
      }

      const [user] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .innerJoin(
          schema.organizationMemberships,
          eq(schema.organizationMemberships.userId, schema.users.id),
        )
        .where(
          and(
            eq(schema.users.workosUserId, workosUserId),
            eq(
              schema.organizationMemberships.organizationId,
              c.var.auth.activeOrganization.localOrganizationId,
            ),
          ),
        )
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
