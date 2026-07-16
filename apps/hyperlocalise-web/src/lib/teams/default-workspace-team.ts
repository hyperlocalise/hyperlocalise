import { and, eq, isNull } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database";
import type { TeamMembershipRole } from "@/lib/database/types";

export const DEFAULT_WORKSPACE_TEAM_SLUG = "default";
export const DEFAULT_WORKSPACE_TEAM_NAME = "Default team";

export async function ensureDefaultWorkspaceTeam(
  organizationId: string,
  database: DatabaseClient = db,
) {
  const [existingTeam] = await database
    .select()
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.organizationId, organizationId),
        eq(schema.teams.slug, DEFAULT_WORKSPACE_TEAM_SLUG),
      ),
    )
    .limit(1);

  if (existingTeam) {
    return existingTeam;
  }

  const [createdTeam] = await database
    .insert(schema.teams)
    .values({
      organizationId,
      slug: DEFAULT_WORKSPACE_TEAM_SLUG,
      name: DEFAULT_WORKSPACE_TEAM_NAME,
    })
    .onConflictDoNothing({
      target: [schema.teams.organizationId, schema.teams.slug],
    })
    .returning();

  if (createdTeam) {
    return createdTeam;
  }

  const [racedTeam] = await database
    .select()
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.organizationId, organizationId),
        eq(schema.teams.slug, DEFAULT_WORKSPACE_TEAM_SLUG),
      ),
    )
    .limit(1);

  if (!racedTeam) {
    throw new Error(`expected default workspace team for organization ${organizationId}`);
  }

  return racedTeam;
}

/**
 * Ensures a team membership exists. Existing roles are left unchanged so
 * managers are not demoted when a later path only needs member visibility.
 */
export async function ensureTeamMembership(input: {
  teamId: string;
  userId: string;
  role?: TeamMembershipRole;
  database?: DatabaseClient;
}) {
  const database = input.database ?? db;

  await database
    .insert(schema.teamMemberships)
    .values({
      teamId: input.teamId,
      userId: input.userId,
      role: input.role ?? "member",
    })
    .onConflictDoNothing({
      target: [schema.teamMemberships.teamId, schema.teamMemberships.userId],
    });
}

export async function ensureDefaultWorkspaceTeamMembership(input: {
  organizationId: string;
  userId: string;
  role?: TeamMembershipRole;
  database?: DatabaseClient;
}) {
  const database = input.database ?? db;
  const team = await ensureDefaultWorkspaceTeam(input.organizationId, database);

  await ensureTeamMembership({
    teamId: team.id,
    userId: input.userId,
    role: input.role,
    database,
  });

  return team;
}

export async function backfillOrganizationProjectTeams(organizationId: string) {
  const team = await ensureDefaultWorkspaceTeam(organizationId);

  await db
    .update(schema.projects)
    .set({ teamId: team.id })
    .where(and(eq(schema.projects.organizationId, organizationId), isNull(schema.projects.teamId)));

  return team;
}
