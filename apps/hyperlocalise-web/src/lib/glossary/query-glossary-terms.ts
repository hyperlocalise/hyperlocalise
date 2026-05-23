import { and, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";

export type GlossaryTermQueryRow = {
  id: string;
  glossaryId: string;
  glossaryName: string;
  sourceTerm: string;
  targetTerm: string;
  targetLocale: string;
  description: string;
  forbidden: boolean;
  caseSensitive: boolean;
  provenance: string;
  externalKey: string | null;
  reviewStatus: string;
};

export async function listGlossaryTermsByGlossaryId(input: {
  organizationId: string;
  glossaryId: string;
}): Promise<GlossaryTermQueryRow[]> {
  return db
    .select({
      id: schema.glossaryTerms.id,
      glossaryId: schema.glossaryTerms.glossaryId,
      glossaryName: schema.glossaries.name,
      sourceTerm: schema.glossaryTerms.sourceTerm,
      targetTerm: schema.glossaryTerms.targetTerm,
      targetLocale: schema.glossaries.targetLocale,
      description: schema.glossaryTerms.description,
      forbidden: schema.glossaryTerms.forbidden,
      caseSensitive: schema.glossaryTerms.caseSensitive,
      provenance: schema.glossaryTerms.provenance,
      externalKey: schema.glossaryTerms.externalKey,
      reviewStatus: schema.glossaryTerms.reviewStatus,
    })
    .from(schema.glossaryTerms)
    .innerJoin(schema.glossaries, eq(schema.glossaryTerms.glossaryId, schema.glossaries.id))
    .where(
      and(
        eq(schema.glossaries.organizationId, input.organizationId),
        eq(schema.glossaryTerms.glossaryId, input.glossaryId),
        eq(schema.glossaries.status, "active"),
      ),
    );
}

export async function listGlossaryTermsForProject(input: {
  organizationId: string;
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
}): Promise<GlossaryTermQueryRow[]> {
  const attached = await db
    .select({ glossaryId: schema.projectGlossaries.glossaryId })
    .from(schema.projectGlossaries)
    .innerJoin(schema.projects, eq(schema.projectGlossaries.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.projectGlossaries.projectId, input.projectId),
        eq(schema.projectGlossaries.organizationId, input.organizationId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    );

  const glossaryIds = attached.map((item) => item.glossaryId);
  if (glossaryIds.length === 0 || input.targetLocales.length === 0) {
    return [];
  }

  return db
    .select({
      id: schema.glossaryTerms.id,
      glossaryId: schema.glossaryTerms.glossaryId,
      glossaryName: schema.glossaries.name,
      sourceTerm: schema.glossaryTerms.sourceTerm,
      targetTerm: schema.glossaryTerms.targetTerm,
      targetLocale: schema.glossaries.targetLocale,
      description: schema.glossaryTerms.description,
      forbidden: schema.glossaryTerms.forbidden,
      caseSensitive: schema.glossaryTerms.caseSensitive,
      provenance: schema.glossaryTerms.provenance,
      externalKey: schema.glossaryTerms.externalKey,
      reviewStatus: schema.glossaryTerms.reviewStatus,
    })
    .from(schema.glossaryTerms)
    .innerJoin(schema.glossaries, eq(schema.glossaryTerms.glossaryId, schema.glossaries.id))
    .where(
      and(
        inArray(schema.glossaryTerms.glossaryId, glossaryIds),
        eq(schema.glossaries.organizationId, input.organizationId),
        eq(schema.glossaries.sourceLocale, input.sourceLocale),
        inArray(schema.glossaries.targetLocale, input.targetLocales),
        eq(schema.glossaries.status, "active"),
        eq(schema.glossaryTerms.reviewStatus, "approved"),
      ),
    );
}
