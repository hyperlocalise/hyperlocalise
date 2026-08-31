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
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import type { Glossary } from "@/lib/database/types";

export type InterchangeSeverity = "warning" | "error";

export type InterchangeDiagnostic = {
  severity: InterchangeSeverity;
  code: string;
  message: string;
  sourceRow?: number;
  conceptId?: string;
  termId?: string;
  field?: string;
};

export type GlossaryInterchangeTerm = {
  id: string;
  conceptId: string;
  locale: string;
  term: string;
  description: string;
  note: string;
  partOfSpeech: string;
  gender: string | null;
  termType: string | null;
  url: string | null;
  lemma: string | null;
  status: string;
  caseSensitive: boolean;
  forbidden: boolean;
  provenance: string;
  reviewStatus: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type GlossaryInterchangeConcept = {
  id: string;
  primaryTerm: string;
  subject: string;
  definition: string;
  translatable: boolean;
  note: string;
  url: string | null;
  figure: string | null;
  languageDetails: Array<{
    locale: string;
    definition: string;
    note: string;
    userId: number | null;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
  metadata: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
  terms: GlossaryInterchangeTerm[];
};

export type GlossaryInterchangeDocument = {
  glossary: Pick<
    Glossary,
    "id" | "name" | "description" | "sourceLocale" | "source" | "termCapabilities"
  >;
  concepts: GlossaryInterchangeConcept[];
};

export type GlossaryImportMode = "preview" | "create" | "update" | "merge" | "replace";

export type GlossaryImportOptions = {
  strictLocale: boolean;
  localeMapping: Record<string, string>;
};

export type GlossaryImportReportCounts = {
  conceptsRead: number;
  termsRead: number;
  conceptsCreated: number;
  termsCreated: number;
  conceptsUpdated: number;
  termsUpdated: number;
  conceptsMerged: number;
  termsMerged: number;
  conceptsSkipped: number;
  termsSkipped: number;
  conceptsFailed: number;
  termsFailed: number;
  created: number;
  updated: number;
  merged: number;
  skipped: number;
  warned: number;
  failed: number;
};

export const emptyImportReportCounts = (): GlossaryImportReportCounts => ({
  conceptsRead: 0,
  termsRead: 0,
  conceptsCreated: 0,
  termsCreated: 0,
  conceptsUpdated: 0,
  termsUpdated: 0,
  conceptsMerged: 0,
  termsMerged: 0,
  conceptsSkipped: 0,
  termsSkipped: 0,
  conceptsFailed: 0,
  termsFailed: 0,
  created: 0,
  updated: 0,
  merged: 0,
  skipped: 0,
  warned: 0,
  failed: 0,
});

export type GlossaryImportDocument = {
  concepts: Array<{
    id: string;
    primaryTerm: string;
    subject?: string;
    definition?: string;
    translatable?: boolean;
    note?: string;
    url?: string | null;
    figure?: string | null;
    languageDetails?: GlossaryInterchangeConcept["languageDetails"];
    metadata?: Record<string, unknown>;
    createdAt?: string;
    updatedAt?: string;
    terms: Array<Omit<GlossaryInterchangeTerm, "conceptId"> & { conceptId?: string }>;
  }>;
  diagnostics: InterchangeDiagnostic[];
};

export type SerializationResult = {
  content: Uint8Array;
  warnings: InterchangeDiagnostic[];
  errors: InterchangeDiagnostic[];
};

export async function loadGlossaryInterchangeDocument(input: {
  glossary: Pick<
    Glossary,
    "id" | "name" | "description" | "sourceLocale" | "source" | "termCapabilities"
  >;
  search?: string;
  locale?: string;
}): Promise<GlossaryInterchangeDocument> {
  const search = input.search?.trim();
  const conceptRows = await db
    .select()
    .from(schema.glossaryConcepts)
    .where(eq(schema.glossaryConcepts.glossaryId, input.glossary.id));
  const termRows = await db
    .select()
    .from(schema.glossaryTerms)
    .where(eq(schema.glossaryTerms.glossaryId, input.glossary.id));

  const termsByConcept = new Map<string, GlossaryInterchangeTerm[]>();
  for (const term of termRows) {
    if (!term.conceptId || !term.locale || !term.term) continue;
    if (input.locale && term.locale !== input.locale) continue;
    const mapped: GlossaryInterchangeTerm = {
      id: term.id,
      conceptId: term.conceptId,
      locale: term.locale,
      term: term.term,
      description: term.description,
      note: term.note,
      partOfSpeech: term.partOfSpeech,
      gender: term.gender,
      termType: term.termType,
      url: term.url,
      lemma: term.lemma,
      status: term.status,
      caseSensitive: term.caseSensitive,
      forbidden: term.forbidden,
      provenance: term.provenance,
      reviewStatus: term.reviewStatus,
      metadata: term.metadata,
      createdAt: term.createdAt.toISOString(),
      updatedAt: term.updatedAt.toISOString(),
    };
    termsByConcept.set(term.conceptId, [...(termsByConcept.get(term.conceptId) ?? []), mapped]);
  }

  return {
    glossary: input.glossary,
    concepts: conceptRows
      .filter((concept) => {
        const conceptTerms = termsByConcept.get(concept.id) ?? [];
        if (input.locale && conceptTerms.length === 0) return false;
        if (!search) return true;
        const needle = search.toLocaleLowerCase();
        return [
          concept.primaryTerm,
          concept.subject,
          concept.definition,
          concept.note,
          ...conceptTerms.flatMap((term) => [
            term.term,
            term.description,
            term.note,
            term.partOfSpeech,
            term.lemma ?? "",
          ]),
        ].some((value) => value.toLocaleLowerCase().includes(needle));
      })
      .map((concept) => ({
        id: concept.id,
        primaryTerm: concept.primaryTerm,
        subject: concept.subject,
        definition: concept.definition,
        translatable: concept.translatable,
        note: concept.note,
        url: concept.url,
        figure: concept.figure,
        languageDetails: concept.languageDetails.map((detail) => ({
          locale: detail.locale,
          definition: detail.definition,
          note: detail.note,
          userId: detail.userId,
          createdAt: detail.createdAt,
          updatedAt: detail.updatedAt,
        })),
        metadata: concept.metadata,
        createdAt: concept.createdAt.toISOString(),
        updatedAt: concept.updatedAt.toISOString(),
        terms: termsByConcept.get(concept.id) ?? [],
      })),
  };
}

export function diagnostic(
  input: Omit<InterchangeDiagnostic, "severity"> & { severity?: InterchangeSeverity },
): InterchangeDiagnostic {
  return { severity: "error", ...input };
}
