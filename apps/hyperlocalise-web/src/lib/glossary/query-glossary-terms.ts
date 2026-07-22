/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
  partOfSpeech: string;
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
      partOfSpeech: schema.glossaryTerms.partOfSpeech,
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
      partOfSpeech: schema.glossaryTerms.partOfSpeech,
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
