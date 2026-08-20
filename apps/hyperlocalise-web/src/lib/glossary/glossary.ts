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
import type { Glossary as NativeGlossaryRecord } from "@/lib/database/types";

export type NativeGlossary = NativeGlossaryRecord;

export const glossaryPartOfSpeechValues = [
  "adjective",
  "adposition",
  "adverb",
  "auxiliary",
  "coordinating conjunction",
  "determiner",
  "interjection",
  "noun",
  "numeral",
  "particle",
  "pronoun",
  "subordinating conjunction",
  "verb",
  "other",
] as const;

export type GlossaryPartOfSpeech = (typeof glossaryPartOfSpeechValues)[number];

export type GlossaryTermRecord = {
  id: string;
  glossaryId: string;
  glossaryName: string;
  sourceTerm: string;
  targetTerm: string;
  targetLocale: string | null;
  description: string;
  partOfSpeech: string;
  url?: string | null;
  lemma?: string | null;
  forbidden: boolean;
  caseSensitive: boolean;
  provenance: string;
  externalKey: string | null;
  reviewStatus: string;
};

export type GlossaryTermCreateInput = {
  sourceTerm: string;
  targetTerm: string;
  description?: string;
  partOfSpeech?: string;
  url?: string;
  lemma?: string | null;
  caseSensitive: boolean;
  forbidden: boolean;
};

export type GlossaryTermUpdateInput = Partial<GlossaryTermCreateInput>;

export type GlossaryConceptImportEntry = {
  conceptKey: string;
  locale: string;
  term: string;
  subject?: string;
  definition?: string;
  translatable?: boolean;
  note?: string;
  url?: string;
  partOfSpeech?: string;
  gender?: string | null;
  termType?: string | null;
  status?: "preferred" | "draft" | "not_recommended";
};

export type NativeGlossaryTermInput = {
  languageId: string;
  text: string;
  description?: string;
  partOfSpeech?: string;
  status?: string;
  type?: string;
  gender?: string;
  note?: string;
  url?: string;
  lemma?: string;
};

export type NativeGlossaryConceptTerm = NativeGlossaryTermInput & {
  id?: number | string;
  conceptId?: number;
  userId?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type NativeGlossaryLanguageDetails = {
  languageId: string;
  userId: number | null;
  definition: string;
  note: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type NativeGlossaryConcept = {
  conceptId?: number;
  primaryTerm: string;
  sourceLocale: string;
  subject?: string;
  definition?: string;
  translatable?: boolean;
  note?: string;
  url?: string | null;
  figure?: string | null;
  externalKey?: string;
  externalUserId?: string | null;
  languageDetails?: NativeGlossaryLanguageDetails[];
  externalCreatedAt?: string | null;
  externalUpdatedAt?: string | null;
  terms: NativeGlossaryConceptTerm[];
};

export class GlossaryValidationError extends Error {
  constructor(
    readonly code: "invalid_part_of_speech",
    message: string,
  ) {
    super(message);
    this.name = "GlossaryValidationError";
  }
}

export function normalizeGlossaryPartOfSpeech(
  value: string | null | undefined,
  options: { required?: boolean } = {},
): GlossaryPartOfSpeech | undefined {
  const required = options.required ?? true;
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) {
    if (!required) return undefined;
    throw new GlossaryValidationError(
      "invalid_part_of_speech",
      "Every glossary term must have a valid part of speech",
    );
  }

  const aliased = normalized === "preposition" ? "adposition" : normalized;
  if (!(glossaryPartOfSpeechValues as readonly string[]).includes(aliased)) {
    throw new GlossaryValidationError(
      "invalid_part_of_speech",
      "Every glossary term must have a valid part of speech",
    );
  }
  return aliased as GlossaryPartOfSpeech;
}

export abstract class Glossary {
  abstract readonly kind: "native" | "crowdin";
  abstract get(): Promise<NativeGlossary | null>;
  abstract update(payload: { name?: string; description?: string }): Promise<NativeGlossary | null>;
  abstract delete(): Promise<boolean>;
  abstract listConcepts(): Promise<NativeGlossaryConcept[]>;
  abstract getConcept(conceptId: string): Promise<NativeGlossaryConcept | null>;
  abstract createConcept(concept: NativeGlossaryConcept): Promise<NativeGlossaryConcept | null>;
  abstract updateConcept(
    conceptId: string,
    concept: NativeGlossaryConcept,
  ): Promise<NativeGlossaryConcept | null>;
  abstract deleteConcept(conceptId: string): Promise<boolean>;
  abstract importConcepts(
    entries: GlossaryConceptImportEntry[],
  ): Promise<{ concepts: NativeGlossaryConcept[]; skipped: number }>;
  abstract listTerms(): Promise<GlossaryTermRecord[]>;
  abstract createGlossaryTerm(input: GlossaryTermCreateInput): Promise<GlossaryTermRecord | null>;
  abstract createGlossaryTerms(
    inputs: GlossaryTermCreateInput[],
  ): Promise<{ created: GlossaryTermRecord[]; skipped: number }>;
  abstract updateGlossaryTerm(
    termId: string,
    input: GlossaryTermUpdateInput,
  ): Promise<GlossaryTermRecord | { error: "duplicate" } | null>;
  abstract deleteGlossaryTerm(termId: string): Promise<boolean>;
  abstract attachProject(projectId: string, priority: number): Promise<void>;
  abstract detachProject(projectId: string): Promise<void>;
  abstract createTerm(
    conceptId: string,
    term: NativeGlossaryTermInput,
  ): Promise<NativeGlossaryConcept | NativeGlossaryConceptTerm | null>;
  abstract updateTerm(
    conceptId: string,
    termId: string,
    term: NativeGlossaryTermInput,
  ): Promise<NativeGlossaryConcept | NativeGlossaryConceptTerm | null>;
  abstract deleteTerm(conceptId: string, termId: string): Promise<boolean>;
}
