/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { and, eq, ne } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { DEFAULT_WORKSPACE_TEAM_SLUG } from "@/lib/teams/default-workspace-team";

export type AttachedTeamGlossary = {
  id: string;
  name: string;
  teamId: string;
};

export type ContributorTeam = {
  id: string;
  name: string;
  slug: string;
};

export type ProjectTeamContext = {
  teamId: string | null;
  teamName: string | null;
  teamSlug: string | null;
};

export async function getProjectTeamContext(projectId: string): Promise<ProjectTeamContext | null> {
  const [row] = await db
    .select({
      teamId: schema.projects.teamId,
      teamName: schema.teams.name,
      teamSlug: schema.teams.slug,
    })
    .from(schema.projects)
    .leftJoin(schema.teams, eq(schema.projects.teamId, schema.teams.id))
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  return row ?? null;
}

export async function getProjectTeamName(projectId: string): Promise<string | null> {
  const context = await getProjectTeamContext(projectId);
  return context?.teamName ?? null;
}

export type ListContributorTeamsOptions = {
  organizationWideAccess?: boolean;
};

export async function listContributorTeams(
  userId: string,
  organizationId: string,
  options: ListContributorTeamsOptions = {},
  client: DatabaseClient = db,
): Promise<ContributorTeam[]> {
  if (options.organizationWideAccess) {
    return client
      .select({
        id: schema.teams.id,
        name: schema.teams.name,
        slug: schema.teams.slug,
      })
      .from(schema.teams)
      .where(
        and(
          eq(schema.teams.organizationId, organizationId),
          ne(schema.teams.slug, DEFAULT_WORKSPACE_TEAM_SLUG),
        ),
      )
      .orderBy(schema.teams.name);
  }

  return client
    .select({
      id: schema.teams.id,
      name: schema.teams.name,
      slug: schema.teams.slug,
    })
    .from(schema.teamMemberships)
    .innerJoin(schema.teams, eq(schema.teamMemberships.teamId, schema.teams.id))
    .where(
      and(
        eq(schema.teamMemberships.userId, userId),
        eq(schema.teams.organizationId, organizationId),
        ne(schema.teams.slug, DEFAULT_WORKSPACE_TEAM_SLUG),
      ),
    )
    .orderBy(schema.teams.name);
}

export async function isUserMemberOfTeam(
  userId: string,
  teamId: string,
  organizationId: string,
  client: DatabaseClient = db,
): Promise<boolean> {
  const [row] = await client
    .select({ id: schema.teamMemberships.id })
    .from(schema.teamMemberships)
    .innerJoin(schema.teams, eq(schema.teamMemberships.teamId, schema.teams.id))
    .where(
      and(
        eq(schema.teamMemberships.userId, userId),
        eq(schema.teamMemberships.teamId, teamId),
        eq(schema.teams.organizationId, organizationId),
      ),
    )
    .limit(1);

  return row !== undefined;
}

export async function listAttachedTeamGlossaries(
  projectId: string,
): Promise<AttachedTeamGlossary[]> {
  const rows = await db
    .select({
      id: schema.glossaries.id,
      name: schema.glossaries.name,
      teamId: schema.glossaries.teamId,
    })
    .from(schema.projectGlossaries)
    .innerJoin(schema.glossaries, eq(schema.projectGlossaries.glossaryId, schema.glossaries.id))
    .innerJoin(schema.projects, eq(schema.projectGlossaries.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.projectGlossaries.projectId, projectId),
        eq(schema.glossaries.status, "active"),
        eq(schema.glossaries.source, "native"),
        eq(schema.glossaries.controlLevel, "team"),
        eq(schema.glossaries.sourceLocale, schema.projects.sourceLocale),
      ),
    )
    .orderBy(schema.projectGlossaries.priority, schema.glossaries.name);

  return rows.flatMap((row) => {
    if (!row.teamId) {
      return [];
    }

    return [{ id: row.id, name: row.name, teamId: row.teamId }];
  });
}

export async function hasAttachedGlossarySourceLocaleConflict(
  projectId: string,
  sourceLocale: string,
  client: DatabaseClient = db,
): Promise<boolean> {
  const [row] = await client
    .select({ id: schema.glossaries.id })
    .from(schema.projectGlossaries)
    .innerJoin(schema.glossaries, eq(schema.projectGlossaries.glossaryId, schema.glossaries.id))
    .where(
      and(
        eq(schema.projectGlossaries.projectId, projectId),
        ne(schema.glossaries.sourceLocale, sourceLocale),
      ),
    )
    .limit(1);

  return row !== undefined;
}
