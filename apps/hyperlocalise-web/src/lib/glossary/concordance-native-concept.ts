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
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, schema } from "@/lib/database";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import {
  glossaryTermFlagsFromStatus,
  normalizedGlossaryTermStatusFromStatus,
} from "@/lib/providers/contracts/glossary-term-status";
import {
  normalizeSyncedDatabaseGlossaryMatch,
  type NormalizedGlossaryConcept,
  type NormalizedGlossaryConceptTerm,
  type NormalizedGlossaryMatch,
} from "@/lib/providers/contracts/glossary-match";
import { sourceContainsTerm } from "@/lib/glossary/validate-glossary-terms-in-translation";

const concordanceSourceTerms = alias(schema.glossaryTerms, "concordance_native_source_terms");

type GlossaryTermRow = typeof schema.glossaryTerms.$inferSelect;
type GlossaryConceptRow = typeof schema.glossaryConcepts.$inferSelect;

export type NativeConceptSourceHit = {
  conceptId: string;
  glossaryId: string;
  glossaryName: string;
  matchedSourceTermId: string;
  matchedSourceTerm: string;
  caseSensitive: boolean;
  sourceStatus: string | null;
  rank: number;
  externalProviderKind: ExternalTmsProviderKind | null;
  externalGlossaryId: string | null;
  externalGlossaryUrl: string | null;
};

function toConceptTerm(row: GlossaryTermRow): NormalizedGlossaryConceptTerm {
  const flags = glossaryTermFlagsFromStatus(row.status);
  return {
    id: row.id,
    locale: row.locale ?? "",
    text: row.term ?? row.sourceTerm,
    status: row.status,
    preferred: flags.preferred,
    forbidden: flags.notRecommended,
    termType: row.termType,
    partOfSpeech: row.partOfSpeech,
    gender: row.gender,
  };
}

export function pickPreferredTermForLocale(
  terms: NormalizedGlossaryConceptTerm[],
  locale: string,
): NormalizedGlossaryConceptTerm | undefined {
  const localeTerms = terms.filter((term) => term.locale === locale);
  if (localeTerms.length === 0) {
    return undefined;
  }

  const byStatus = (status: string) =>
    localeTerms.find((term) => term.status?.trim().toLowerCase().replaceAll("_", " ") === status);

  return (
    byStatus("preferred") ??
    byStatus("admitted") ??
    localeTerms.find((term) => !glossaryTermFlagsFromStatus(term.status).notRecommended) ??
    localeTerms[0]
  );
}

function buildNormalizedConcept(input: {
  concept: GlossaryConceptRow;
  terms: GlossaryTermRow[];
  sourceLocale: string;
  glossaryUrl: string | null;
}): NormalizedGlossaryConcept {
  const conceptTerms = input.terms.map(toConceptTerm);
  return {
    id: input.concept.id,
    primaryTerm: input.concept.primaryTerm,
    subject: input.concept.subject,
    definition: input.concept.definition,
    glossaryUrl: input.glossaryUrl ?? input.concept.url,
    sourceTerms: conceptTerms.filter((term) => term.locale === input.sourceLocale),
    targetTerms: conceptTerms.filter((term) => term.locale !== input.sourceLocale),
  };
}

export async function loadNativeConceptSourceHits(input: {
  glossaryIds: string[];
  sourceLocale: string;
  tsQuery: string;
  limit: number;
}): Promise<NativeConceptSourceHit[]> {
  if (input.glossaryIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      conceptId: concordanceSourceTerms.conceptId,
      glossaryId: concordanceSourceTerms.glossaryId,
      glossaryName: schema.glossaries.name,
      matchedSourceTermId: concordanceSourceTerms.id,
      matchedSourceTerm: sql<string>`${concordanceSourceTerms.term}`,
      caseSensitive: concordanceSourceTerms.caseSensitive,
      sourceStatus: concordanceSourceTerms.status,
      rank: sql<number>`ts_rank(${concordanceSourceTerms.searchVector}, to_tsquery('simple', ${input.tsQuery}))`.as(
        "rank",
      ),
      externalProviderKind: schema.glossaries.externalProviderKind,
      externalGlossaryId: schema.glossaries.externalGlossaryId,
      externalGlossaryUrl: schema.glossaries.externalUrl,
    })
    .from(concordanceSourceTerms)
    .innerJoin(schema.glossaries, eq(concordanceSourceTerms.glossaryId, schema.glossaries.id))
    .where(
      and(
        inArray(concordanceSourceTerms.glossaryId, input.glossaryIds),
        eq(schema.glossaries.source, "native"),
        eq(schema.glossaries.sourceLocale, input.sourceLocale),
        eq(schema.glossaries.status, "active"),
        eq(concordanceSourceTerms.locale, input.sourceLocale),
        isNotNull(concordanceSourceTerms.conceptId),
        isNotNull(concordanceSourceTerms.term),
        eq(concordanceSourceTerms.reviewStatus, "approved"),
        sql`${concordanceSourceTerms.searchVector} @@ to_tsquery('simple', ${input.tsQuery})`,
      ),
    )
    .orderBy(desc(sql`rank`))
    .limit(input.limit);

  return rows.flatMap((row) =>
    row.conceptId
      ? [
          {
            conceptId: row.conceptId,
            glossaryId: row.glossaryId,
            glossaryName: row.glossaryName,
            matchedSourceTermId: row.matchedSourceTermId,
            matchedSourceTerm: row.matchedSourceTerm,
            caseSensitive: row.caseSensitive,
            sourceStatus: row.sourceStatus,
            rank: Number(row.rank) || 0,
            externalProviderKind: row.externalProviderKind,
            externalGlossaryId: row.externalGlossaryId,
            externalGlossaryUrl: row.externalGlossaryUrl,
          },
        ]
      : [],
  );
}

export async function hydrateNativeConceptConcordanceMatches(input: {
  sourceHits: NativeConceptSourceHit[];
  sourceLocale: string;
  targetLocales: string[];
  sourceText: string;
  limit: number;
}): Promise<NormalizedGlossaryMatch[]> {
  const filteredHits = input.sourceHits.filter((hit) =>
    sourceContainsTerm(input.sourceText, {
      sourceTerm: hit.matchedSourceTerm,
      caseSensitive: hit.caseSensitive ?? false,
    }),
  );

  const bestHitByConcept = new Map<string, NativeConceptSourceHit>();
  for (const hit of filteredHits) {
    const existing = bestHitByConcept.get(hit.conceptId);
    if (!existing || hit.rank > existing.rank) {
      bestHitByConcept.set(hit.conceptId, hit);
    }
  }

  const conceptIds = [...bestHitByConcept.keys()];
  if (conceptIds.length === 0) {
    return [];
  }

  const [concepts, terms] = await Promise.all([
    db
      .select()
      .from(schema.glossaryConcepts)
      .where(inArray(schema.glossaryConcepts.id, conceptIds)),
    db
      .select()
      .from(schema.glossaryTerms)
      .where(inArray(schema.glossaryTerms.conceptId, conceptIds)),
  ]);

  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  const termsByConceptId = new Map<string, GlossaryTermRow[]>();
  for (const term of terms) {
    if (!term.conceptId) {
      continue;
    }
    const current = termsByConceptId.get(term.conceptId) ?? [];
    current.push(term);
    termsByConceptId.set(term.conceptId, current);
  }

  const matches: NormalizedGlossaryMatch[] = [];

  for (const hit of [...bestHitByConcept.values()].toSorted(
    (left, right) => right.rank - left.rank,
  )) {
    const concept = conceptById.get(hit.conceptId);
    const conceptTerms = termsByConceptId.get(hit.conceptId);
    if (!concept || !conceptTerms) {
      continue;
    }

    const normalizedConcept = buildNormalizedConcept({
      concept,
      terms: conceptTerms,
      sourceLocale: input.sourceLocale,
      glossaryUrl: hit.externalGlossaryUrl,
    });

    for (const targetLocale of input.targetLocales) {
      const preferredTarget = pickPreferredTermForLocale(
        normalizedConcept.targetTerms,
        targetLocale,
      );
      if (!preferredTarget) {
        continue;
      }

      const sourceStatus = normalizedGlossaryTermStatusFromStatus(hit.sourceStatus);
      const targetStatus = normalizedGlossaryTermStatusFromStatus(preferredTarget.status);

      matches.push(
        normalizeSyncedDatabaseGlossaryMatch({
          id: `${hit.matchedSourceTermId}:${targetLocale}`,
          glossaryId: hit.glossaryId,
          glossaryName: hit.glossaryName,
          sourceTerm: hit.matchedSourceTerm,
          targetTerm: preferredTarget.text,
          sourceLocale: input.sourceLocale,
          targetLocale,
          description: concept.definition || null,
          forbidden: sourceStatus.forbidden || targetStatus.forbidden,
          caseSensitive: hit.caseSensitive ?? false,
          rank: hit.rank || 1,
          providerKind: hit.externalProviderKind,
          externalResourceId: hit.externalGlossaryId,
          externalTermId: null,
          concept: normalizedConcept,
        }),
      );
    }
  }

  return matches.toSorted((left, right) => right.rank - left.rank).slice(0, input.limit);
}

export async function loadNativeConceptConcordanceMatches(input: {
  glossaryIds: string[];
  sourceLocale: string;
  targetLocales: string[];
  sourceText: string;
  tsQuery: string;
  limit: number;
}): Promise<NormalizedGlossaryMatch[]> {
  const sourceHits = await loadNativeConceptSourceHits({
    glossaryIds: input.glossaryIds,
    sourceLocale: input.sourceLocale,
    tsQuery: input.tsQuery,
    limit: input.limit,
  });

  return hydrateNativeConceptConcordanceMatches({
    sourceHits,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    sourceText: input.sourceText,
    limit: input.limit,
  });
}
