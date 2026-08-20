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
