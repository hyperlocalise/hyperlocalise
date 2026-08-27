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
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

export type AttachedTeamGlossary = {
  id: string;
  name: string;
};

export async function listAttachedTeamGlossaries(
  projectId: string,
): Promise<AttachedTeamGlossary[]> {
  const rows = await db
    .select({
      id: schema.glossaries.id,
      name: schema.glossaries.name,
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

  return rows;
}

export async function getProjectTeamName(projectId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: schema.teams.name })
    .from(schema.projects)
    .innerJoin(schema.teams, eq(schema.projects.teamId, schema.teams.id))
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  return row?.name ?? null;
}
