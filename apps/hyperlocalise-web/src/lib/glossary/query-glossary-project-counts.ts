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
import { count, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { Glossary } from "@/lib/database/types";

export async function queryGlossaryProjectCounts(glossaries: Glossary[]) {
  const projectCountsByGlossaryId = new Map<string, number>();

  for (const glossary of glossaries) {
    projectCountsByGlossaryId.set(glossary.id, 0);
  }

  if (glossaries.length === 0) return projectCountsByGlossaryId;

  const rows = await db
    .select({
      glossaryId: schema.projectGlossaries.glossaryId,
      projectCount: count(),
    })
    .from(schema.projectGlossaries)
    .where(
      inArray(
        schema.projectGlossaries.glossaryId,
        glossaries.map((glossary) => glossary.id),
      ),
    )
    .groupBy(schema.projectGlossaries.glossaryId);

  for (const row of rows) {
    projectCountsByGlossaryId.set(row.glossaryId, Number(row.projectCount));
  }

  return projectCountsByGlossaryId;
}

export async function queryGlossaryProjectCount(glossary: Glossary) {
  const counts = await queryGlossaryProjectCounts([glossary]);
  return counts.get(glossary.id) ?? 0;
}
