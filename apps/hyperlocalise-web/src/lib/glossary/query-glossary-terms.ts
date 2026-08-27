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
import { and, asc, eq, inArray, isNotNull, or } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database";

import {
  flattenNativeConceptTermsToPairs,
  type GlossaryTermQueryRow,
  type NativeConceptGroup,
} from "./flatten-native-glossary-pairs";

export type { GlossaryTermQueryRow } from "./flatten-native-glossary-pairs";

function groupConceptTerms(
  rows: Array<{
    id: string;
    conceptId: string;
    glossaryId: string;
    glossaryName: string;
    translatable: boolean;
    locale: string | null;
    term: string | null;
    status: string;
    description: string;
    partOfSpeech: string;
    caseSensitive: boolean;
    provenance: string;
    reviewStatus: string;
  }>,
): NativeConceptGroup[] {
  const concepts = new Map<string, NativeConceptGroup>();

  for (const row of rows) {
    if (!row.locale || !row.term) {
      continue;
    }

    const existing = concepts.get(row.conceptId);
    const termRow = {
      id: row.id,
      locale: row.locale,
      term: row.term,
      status: row.status,
      description: row.description,
      partOfSpeech: row.partOfSpeech,
      caseSensitive: row.caseSensitive,
      provenance: row.provenance,
      reviewStatus: row.reviewStatus,
    };

    if (existing) {
      existing.terms.push(termRow);
      continue;
    }

    concepts.set(row.conceptId, {
      conceptId: row.conceptId,
      glossaryId: row.glossaryId,
      glossaryName: row.glossaryName,
      translatable: row.translatable,
      terms: [termRow],
    });
  }

  return [...concepts.values()];
}

export async function listNativeGlossaryTermPairs(
  database: DatabaseClient,
  input: {
    organizationId: string;
    glossaryIds: string[];
    sourceLocale: string;
    targetLocales: string[];
    glossaryPriority?: Map<string, number>;
  },
): Promise<GlossaryTermQueryRow[]> {
  if (input.glossaryIds.length === 0 || input.targetLocales.length === 0) {
    return [];
  }

  const rows = await database
    .select({
      id: schema.glossaryTerms.id,
      conceptId: schema.glossaryTerms.conceptId,
      glossaryId: schema.glossaryTerms.glossaryId,
      glossaryName: schema.glossaries.name,
      translatable: schema.glossaryConcepts.translatable,
      locale: schema.glossaryTerms.locale,
      term: schema.glossaryTerms.term,
      status: schema.glossaryTerms.status,
      description: schema.glossaryTerms.description,
      partOfSpeech: schema.glossaryTerms.partOfSpeech,
      caseSensitive: schema.glossaryTerms.caseSensitive,
      provenance: schema.glossaryTerms.provenance,
      reviewStatus: schema.glossaryTerms.reviewStatus,
    })
    .from(schema.glossaryTerms)
    .innerJoin(
      schema.glossaryConcepts,
      eq(schema.glossaryTerms.conceptId, schema.glossaryConcepts.id),
    )
    .innerJoin(schema.glossaries, eq(schema.glossaryTerms.glossaryId, schema.glossaries.id))
    .where(
      and(
        inArray(schema.glossaryTerms.glossaryId, input.glossaryIds),
        eq(schema.glossaries.organizationId, input.organizationId),
        eq(schema.glossaries.source, "native"),
        eq(schema.glossaries.sourceLocale, input.sourceLocale),
        eq(schema.glossaries.status, "active"),
        isNotNull(schema.glossaryTerms.conceptId),
        isNotNull(schema.glossaryTerms.term),
        isNotNull(schema.glossaryTerms.locale),
        eq(schema.glossaryTerms.reviewStatus, "approved"),
        or(
          eq(schema.glossaryTerms.locale, input.sourceLocale),
          inArray(schema.glossaryTerms.locale, input.targetLocales),
        ),
      ),
    );

  return flattenNativeConceptTermsToPairs({
    concepts: groupConceptTerms(
      rows.map((row) => ({
        ...row,
        conceptId: row.conceptId!,
      })),
    ),
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    glossaryPriority: input.glossaryPriority,
  });
}

export async function listGlossaryTermsForProject(input: {
  organizationId: string;
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
}): Promise<GlossaryTermQueryRow[]> {
  const attached = await db
    .select({
      glossaryId: schema.projectGlossaries.glossaryId,
      priority: schema.projectGlossaries.priority,
    })
    .from(schema.projectGlossaries)
    .innerJoin(schema.projects, eq(schema.projectGlossaries.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.projectGlossaries.projectId, input.projectId),
        eq(schema.projectGlossaries.organizationId, input.organizationId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .orderBy(asc(schema.projectGlossaries.priority));

  const glossaryIds = attached.map((item) => item.glossaryId);
  if (glossaryIds.length === 0 || input.targetLocales.length === 0) {
    return [];
  }

  const glossaryPriority = new Map(attached.map((item) => [item.glossaryId, item.priority]));

  return listNativeGlossaryTermPairs(db, {
    glossaryIds,
    organizationId: input.organizationId,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    glossaryPriority,
  });
}
