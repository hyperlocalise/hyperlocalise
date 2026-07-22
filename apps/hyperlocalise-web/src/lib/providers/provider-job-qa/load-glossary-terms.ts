/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import type { ProviderQaGlossaryTerm } from "./types";

export async function loadProjectGlossaryTerms(
  projectId: string,
): Promise<ProviderQaGlossaryTerm[]> {
  const rows = await db
    .select({
      sourceTerm: schema.glossaryTerms.sourceTerm,
      targetTerm: schema.glossaryTerms.targetTerm,
      forbidden: schema.glossaryTerms.forbidden,
      caseSensitive: schema.glossaryTerms.caseSensitive,
      reviewStatus: schema.glossaryTerms.reviewStatus,
    })
    .from(schema.projectGlossaries)
    .innerJoin(
      schema.glossaryTerms,
      eq(schema.glossaryTerms.glossaryId, schema.projectGlossaries.glossaryId),
    )
    .where(eq(schema.projectGlossaries.projectId, projectId));

  return rows
    .filter((row) => row.reviewStatus === "approved")
    .map((row) => ({
      sourceTerm: row.sourceTerm,
      targetTerm: row.targetTerm,
      forbidden: row.forbidden,
      caseSensitive: row.caseSensitive,
    }));
}
