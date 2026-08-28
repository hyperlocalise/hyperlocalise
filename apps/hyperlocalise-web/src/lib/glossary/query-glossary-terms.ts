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
import { and, asc, eq, inArray, isNotNull, min, or } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";

import {
  compareGlossaryTermQueryRows,
  flattenNativeConceptTermsToPairs,
  type GlossaryTermQueryRow,
  type NativeConceptGroup,
} from "./flatten-native-glossary-pairs";

export type { GlossaryTermQueryRow } from "./flatten-native-glossary-pairs";

/** Upper bound for file-translation glossary context before source-text filtering. */
export const FILE_TRANSLATION_GLOSSARY_PAIR_LIMIT = 500;

const NATIVE_GLOSSARY_CONCEPT_BATCH_SIZE = 50;

type NativeConceptSummary = {
  conceptId: string;
  glossaryId: string;
  glossaryName: string;
  minSourceTerm: string;
};

export async function resolveProjectGlossarySourceLocale(input: {
  organizationId: string;
  projectId: string;
  contentSourceLocale?: string | null;
}): Promise<string> {
  const trimmedContentLocale = input.contentSourceLocale?.trim();
  if (trimmedContentLocale) {
    return trimmedContentLocale;
  }

  const [project] = await db
    .select({ sourceLocale: schema.projects.sourceLocale })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  return project?.sourceLocale?.trim() || "en";
}

export function groupConceptTerms(
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

function sortNativeConceptSummaries(
  rows: NativeConceptSummary[],
  glossaryPriority?: Map<string, number>,
): NativeConceptSummary[] {
  return rows.toSorted((left, right) => {
    if (glossaryPriority && glossaryPriority.size > 0) {
      const leftPriority = glossaryPriority.get(left.glossaryId) ?? 0;
      const rightPriority = glossaryPriority.get(right.glossaryId) ?? 0;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
    }
    if (left.glossaryName !== right.glossaryName) {
      return left.glossaryName.localeCompare(right.glossaryName);
    }
    return left.minSourceTerm.localeCompare(right.minSourceTerm);
  });
}

function mergeSortedGlossaryTermPairs(
  left: GlossaryTermQueryRow[],
  right: GlossaryTermQueryRow[],
  glossaryPriority?: Map<string, number>,
): GlossaryTermQueryRow[] {
  const merged: GlossaryTermQueryRow[] = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (compareGlossaryTermQueryRows(left[leftIndex], right[rightIndex], glossaryPriority) <= 0) {
      merged.push(left[leftIndex]);
      leftIndex += 1;
      continue;
    }

    merged.push(right[rightIndex]);
    rightIndex += 1;
  }

  while (leftIndex < left.length) {
    merged.push(left[leftIndex]);
    leftIndex += 1;
  }

  while (rightIndex < right.length) {
    merged.push(right[rightIndex]);
    rightIndex += 1;
  }

  return merged;
}

function canStopLoadingPairsAfterCutoff(
  remainingConcepts: NativeConceptSummary[],
  cutoff: GlossaryTermQueryRow,
  glossaryPriority?: Map<string, number>,
): boolean {
  const cutoffPriority = glossaryPriority?.get(cutoff.glossaryId) ?? 0;

  for (const concept of remainingConcepts) {
    const conceptPriority = glossaryPriority?.get(concept.glossaryId) ?? 0;
    if (conceptPriority < cutoffPriority) {
      return false;
    }
    if (conceptPriority > cutoffPriority) {
      continue;
    }
    if (concept.glossaryName < cutoff.glossaryName) {
      return false;
    }
    if (concept.glossaryName > cutoff.glossaryName) {
      continue;
    }
    if (concept.minSourceTerm <= cutoff.sourceTerm) {
      return false;
    }
  }

  return true;
}

async function listOrderedNativeConceptSummaries(
  database: DatabaseClient,
  input: {
    organizationId: string;
    glossaryIds: string[];
    sourceLocale: string;
    glossaryPriority?: Map<string, number>;
  },
): Promise<NativeConceptSummary[]> {
  const rows = await database
    .select({
      conceptId: schema.glossaryConcepts.id,
      glossaryId: schema.glossaryConcepts.glossaryId,
      glossaryName: schema.glossaries.name,
      minSourceTerm: min(schema.glossaryTerms.term),
    })
    .from(schema.glossaryConcepts)
    .innerJoin(schema.glossaries, eq(schema.glossaryConcepts.glossaryId, schema.glossaries.id))
    .innerJoin(
      schema.glossaryTerms,
      and(
        eq(schema.glossaryTerms.conceptId, schema.glossaryConcepts.id),
        eq(schema.glossaryTerms.locale, input.sourceLocale),
        eq(schema.glossaryTerms.reviewStatus, "approved"),
        isNotNull(schema.glossaryTerms.term),
      ),
    )
    .where(
      and(
        inArray(schema.glossaryConcepts.glossaryId, input.glossaryIds),
        eq(schema.glossaries.organizationId, input.organizationId),
        eq(schema.glossaries.source, "native"),
        eq(schema.glossaries.sourceLocale, input.sourceLocale),
        eq(schema.glossaries.status, "active"),
      ),
    )
    .groupBy(
      schema.glossaryConcepts.id,
      schema.glossaryConcepts.glossaryId,
      schema.glossaries.name,
    );

  return sortNativeConceptSummaries(
    rows.flatMap((row) =>
      row.minSourceTerm
        ? [
            {
              conceptId: row.conceptId,
              glossaryId: row.glossaryId,
              glossaryName: row.glossaryName,
              minSourceTerm: row.minSourceTerm,
            },
          ]
        : [],
    ),
    input.glossaryPriority,
  );
}

async function fetchNativeConceptTermRows(
  database: DatabaseClient,
  input: {
    organizationId: string;
    glossaryIds: string[];
    sourceLocale: string;
    targetLocales: string[];
    conceptIds: string[];
  },
) {
  if (input.conceptIds.length === 0) {
    return [];
  }

  return database
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
        inArray(schema.glossaryTerms.conceptId, input.conceptIds),
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
}

async function listNativeGlossaryTermPairsWithCap(
  database: DatabaseClient,
  input: {
    organizationId: string;
    glossaryIds: string[];
    sourceLocale: string;
    targetLocales: string[];
    glossaryPriority?: Map<string, number>;
    maxPairs: number;
  },
): Promise<GlossaryTermQueryRow[]> {
  const orderedConcepts = await listOrderedNativeConceptSummaries(database, input);
  if (orderedConcepts.length === 0) {
    return [];
  }

  let pairs: GlossaryTermQueryRow[] = [];
  let conceptIndex = 0;

  while (conceptIndex < orderedConcepts.length) {
    const batchConceptIds = orderedConcepts
      .slice(conceptIndex, conceptIndex + NATIVE_GLOSSARY_CONCEPT_BATCH_SIZE)
      .map((concept) => concept.conceptId);
    conceptIndex += NATIVE_GLOSSARY_CONCEPT_BATCH_SIZE;

    const rows = await fetchNativeConceptTermRows(database, {
      organizationId: input.organizationId,
      glossaryIds: input.glossaryIds,
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales,
      conceptIds: batchConceptIds,
    });

    const batchPairs = flattenNativeConceptTermsToPairs({
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

    pairs = mergeSortedGlossaryTermPairs(pairs, batchPairs, input.glossaryPriority).slice(
      0,
      input.maxPairs,
    );

    if (
      pairs.length >= input.maxPairs &&
      canStopLoadingPairsAfterCutoff(
        orderedConcepts.slice(conceptIndex),
        pairs[input.maxPairs - 1],
        input.glossaryPriority,
      )
    ) {
      break;
    }
  }

  return pairs;
}

export async function listNativeGlossaryTermPairs(
  database: DatabaseClient,
  input: {
    organizationId: string;
    glossaryIds: string[];
    sourceLocale: string;
    targetLocales: string[];
    glossaryPriority?: Map<string, number>;
    maxPairs?: number;
  },
): Promise<GlossaryTermQueryRow[]> {
  if (input.glossaryIds.length === 0 || input.targetLocales.length === 0) {
    return [];
  }

  if (input.maxPairs !== undefined) {
    return listNativeGlossaryTermPairsWithCap(database, {
      ...input,
      maxPairs: input.maxPairs,
    });
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
  maxPairs?: number;
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
    maxPairs: input.maxPairs,
  });
}
