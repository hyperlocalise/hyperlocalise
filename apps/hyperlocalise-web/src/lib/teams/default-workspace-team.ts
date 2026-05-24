import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/lib/database";

export const DEFAULT_WORKSPACE_TEAM_SLUG = "default";
export const DEFAULT_WORKSPACE_TEAM_NAME = "Default team";

export async function ensureDefaultWorkspaceTeam(organizationId: string) {
  const [existingTeam] = await db
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

  const [createdTeam] = await db
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

  const [racedTeam] = await db
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

export async function backfillOrganizationProjectTeams(organizationId: string) {
  const team = await ensureDefaultWorkspaceTeam(organizationId);

  await db
    .update(schema.projects)
    .set({ teamId: team.id })
    .where(and(eq(schema.projects.organizationId, organizationId), isNull(schema.projects.teamId)));

  return team;
}
