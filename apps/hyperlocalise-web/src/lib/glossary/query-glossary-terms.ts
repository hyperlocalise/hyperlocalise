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
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, schema, type DatabaseClient } from "@/lib/database";

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

const nativeSourceTerms = alias(schema.glossaryTerms, "native_source_terms");
const nativeTargetTerms = alias(schema.glossaryTerms, "native_target_terms");

export async function listNativeGlossaryTermPairs(
  database: DatabaseClient,
  input: {
    organizationId: string;
    glossaryIds: string[];
    sourceLocale: string;
    targetLocales: string[];
  },
): Promise<GlossaryTermQueryRow[]> {
  if (input.glossaryIds.length === 0 || input.targetLocales.length === 0) {
    return [];
  }

  return database
    .select({
      id: nativeTargetTerms.id,
      glossaryId: nativeSourceTerms.glossaryId,
      glossaryName: schema.glossaries.name,
      sourceTerm: sql<string>`${nativeSourceTerms.term}`,
      targetTerm: sql<string>`${nativeTargetTerms.term}`,
      targetLocale: sql<string>`${nativeTargetTerms.locale}`,
      description: nativeSourceTerms.description,
      partOfSpeech: nativeSourceTerms.partOfSpeech,
      forbidden: nativeSourceTerms.forbidden,
      caseSensitive: nativeSourceTerms.caseSensitive,
      provenance: nativeSourceTerms.provenance,
      externalKey: sql<string | null>`null`,
      reviewStatus: nativeSourceTerms.reviewStatus,
    })
    .from(nativeSourceTerms)
    .innerJoin(
      nativeTargetTerms,
      and(
        eq(nativeSourceTerms.glossaryId, nativeTargetTerms.glossaryId),
        eq(nativeSourceTerms.conceptId, nativeTargetTerms.conceptId),
      ),
    )
    .innerJoin(schema.glossaries, eq(nativeSourceTerms.glossaryId, schema.glossaries.id))
    .where(
      and(
        inArray(nativeSourceTerms.glossaryId, input.glossaryIds),
        eq(schema.glossaries.organizationId, input.organizationId),
        eq(schema.glossaries.source, "native"),
        eq(schema.glossaries.sourceLocale, input.sourceLocale),
        eq(schema.glossaries.status, "active"),
        eq(nativeSourceTerms.locale, input.sourceLocale),
        inArray(nativeTargetTerms.locale, input.targetLocales),
        isNotNull(nativeSourceTerms.conceptId),
        isNotNull(nativeSourceTerms.term),
        isNotNull(nativeTargetTerms.term),
        eq(nativeSourceTerms.reviewStatus, "approved"),
        eq(nativeTargetTerms.reviewStatus, "approved"),
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

  return listNativeGlossaryTermPairs(db, {
    glossaryIds,
    organizationId: input.organizationId,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
  });
}
