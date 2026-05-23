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
