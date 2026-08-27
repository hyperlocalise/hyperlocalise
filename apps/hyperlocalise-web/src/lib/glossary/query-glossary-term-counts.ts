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
import { and, count, inArray, isNotNull } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { Glossary } from "@/lib/database/types";

export async function queryNativeGlossaryTermCounts(glossaries: Glossary[]) {
  const nativeGlossaries = glossaries.filter((glossary) => glossary.source === "native");
  const termCountsByGlossaryId = new Map<string, number>();

  for (const glossary of nativeGlossaries) {
    termCountsByGlossaryId.set(glossary.id, 0);
  }

  if (nativeGlossaries.length === 0) {
    return termCountsByGlossaryId;
  }

  const rows = await db
    .select({
      glossaryId: schema.glossaryTerms.glossaryId,
      termCount: count(),
    })
    .from(schema.glossaryTerms)
    .where(
      and(
        inArray(
          schema.glossaryTerms.glossaryId,
          nativeGlossaries.map((glossary) => glossary.id),
        ),
        isNotNull(schema.glossaryTerms.conceptId),
      ),
    )
    .groupBy(schema.glossaryTerms.glossaryId);

  for (const row of rows) {
    termCountsByGlossaryId.set(row.glossaryId, Number(row.termCount));
  }

  return termCountsByGlossaryId;
}

export async function queryNativeGlossaryTermCountForGlossary(glossary: Glossary) {
  const counts = await queryNativeGlossaryTermCounts([glossary]);
  return counts.get(glossary.id) ?? 0;
}
