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
import { inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { Glossary } from "@/lib/database/types";

export async function queryGlossaryTeamNamesById(
  glossaries: ReadonlyArray<Pick<Glossary, "teamId">>,
): Promise<Map<string, string>> {
  const teamIds = [
    ...new Set(
      glossaries
        .map((glossary) => glossary.teamId)
        .filter((teamId): teamId is string => Boolean(teamId)),
    ),
  ];

  if (teamIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ id: schema.teams.id, name: schema.teams.name })
    .from(schema.teams)
    .where(inArray(schema.teams.id, teamIds));

  return new Map(rows.map((row) => [row.id, row.name]));
}

export function resolveGlossaryTeamName(
  glossary: Pick<Glossary, "teamId">,
  teamNamesById: ReadonlyMap<string, string>,
): string | null {
  if (!glossary.teamId) {
    return null;
  }

  return teamNamesById.get(glossary.teamId) ?? null;
}
