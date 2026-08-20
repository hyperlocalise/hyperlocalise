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
import { and, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { NativeGlossaryConcept, NativeGlossaryTermInput } from "./glossary";
import { Glossary } from "./glossary";
import type { GlossaryProviderContext } from "./glossary-provider";

export class NativeGlossary extends Glossary {
  readonly kind = "native" as const;

  constructor(private readonly input: GlossaryProviderContext) {
    super();
  }

  async get() {
    const [glossary] = await db
      .select()
      .from(schema.glossaries)
      .where(
        and(
          eq(schema.glossaries.id, this.input.glossary.id),
          eq(schema.glossaries.organizationId, this.input.auth.organization.localOrganizationId),
        ),
      )
      .limit(1);
    return glossary ?? null;
  }

  async update(payload: { name?: string; description?: string }) {
    const [glossary] = await db
      .update(schema.glossaries)
      .set(payload)
      .where(
        and(
          eq(schema.glossaries.id, this.input.glossary.id),
          eq(schema.glossaries.organizationId, this.input.auth.organization.localOrganizationId),
        ),
      )
      .returning();
    return glossary ?? null;
  }

  async delete() {
    const deleted = await db
      .delete(schema.glossaries)
      .where(
        and(
          eq(schema.glossaries.id, this.input.glossary.id),
          eq(schema.glossaries.organizationId, this.input.auth.organization.localOrganizationId),
        ),
      )
      .returning({ id: schema.glossaries.id });
    return deleted.length > 0;
  }

  private async loadConcept(conceptId: string) {
    const [concept] = await db
      .select()
      .from(schema.glossaryConcepts)
      .where(
        and(
          eq(schema.glossaryConcepts.id, conceptId),
          eq(schema.glossaryConcepts.glossaryId, this.input.glossary.id),
        ),
      )
      .limit(1);
    if (!concept) return null;

    const terms = await db
      .select()
      .from(schema.glossaryTerms)
      .where(eq(schema.glossaryTerms.conceptId, concept.id));
    return { concept, terms };
  }

  private toConceptRecord(
    loaded: NonNullable<Awaited<ReturnType<NativeGlossary["loadConcept"]>>>,
  ): NativeGlossaryConcept {
    return {
      primaryTerm: loaded.concept.primaryTerm,
      sourceLocale: this.input.glossary.sourceLocale,
      subject: loaded.concept.subject,
      definition: loaded.concept.definition,
      translatable: loaded.concept.translatable,
      note: loaded.concept.note,
      url: loaded.concept.url,
      figure: loaded.concept.figure,
      externalKey: loaded.concept.id,
      externalUserId: null,
      externalCreatedAt: loaded.concept.createdAt.toISOString(),
      externalUpdatedAt: loaded.concept.updatedAt.toISOString(),
      languageDetails: loaded.concept.languageDetails,
      terms: loaded.terms.map((term) => ({
        id: term.id,
        languageId: term.locale ?? "",
        text: term.term ?? term.sourceTerm,
        description: term.description,
        partOfSpeech: term.partOfSpeech,
        status: term.status,
        type: term.termType ?? undefined,
        gender: term.gender ?? undefined,
        note: "",
        url: term.url ?? undefined,
        lemma: term.lemma ?? undefined,
        createdAt: term.createdAt.toISOString(),
        updatedAt: term.updatedAt.toISOString(),
      })),
    };
  }

  private toTermRecord(term: typeof schema.glossaryTerms.$inferSelect) {
    return {
      id: term.id,
      languageId: term.locale ?? "",
      text: term.term ?? term.sourceTerm,
      description: term.description,
      partOfSpeech: term.partOfSpeech,
      status: term.status,
      type: term.termType ?? undefined,
      gender: term.gender ?? undefined,
      note: "",
      url: term.url ?? undefined,
      lemma: term.lemma ?? undefined,
      createdAt: term.createdAt.toISOString(),
      updatedAt: term.updatedAt.toISOString(),
    };
  }

  async listConcepts() {
    const concepts = await db
      .select()
      .from(schema.glossaryConcepts)
      .where(eq(schema.glossaryConcepts.glossaryId, this.input.glossary.id));
    if (concepts.length === 0) return [];

    const terms = await db
      .select()
      .from(schema.glossaryTerms)
      .where(
        and(
          eq(schema.glossaryTerms.glossaryId, this.input.glossary.id),
          inArray(
            schema.glossaryTerms.conceptId,
            concepts.map((concept) => concept.id),
          ),
        ),
      );
    const termsByConcept = new Map<string, typeof terms>();
    for (const term of terms) {
      if (!term.conceptId) continue;
      const current = termsByConcept.get(term.conceptId) ?? [];
      current.push(term);
      termsByConcept.set(term.conceptId, current);
    }
    return concepts.map((concept) =>
      this.toConceptRecord({ concept, terms: termsByConcept.get(concept.id) ?? [] }),
    );
  }

  async getConcept(conceptId: string) {
    const loaded = await this.loadConcept(conceptId);
    return loaded ? this.toConceptRecord(loaded) : null;
  }

  async createConcept(input: NativeGlossaryConcept) {
    const created = await db.transaction(async (tx) => {
      const [concept] = await tx
        .insert(schema.glossaryConcepts)
        .values({
          glossaryId: this.input.glossary.id,
          primaryTerm: input.primaryTerm,
          subject: input.subject ?? "",
          definition: input.definition ?? "",
          translatable: input.translatable ?? true,
          note: input.note ?? "",
          url: input.url || null,
          figure: input.figure || null,
          languageDetails: input.languageDetails ?? [],
        })
        .returning();
      if (input.terms.length > 0) {
        await tx.insert(schema.glossaryTerms).values(
          input.terms.map((term) => ({
            glossaryId: this.input.glossary.id,
            conceptId: concept.id,
            locale: term.languageId,
            term: term.text,
            sourceTerm: term.text,
            targetTerm: term.text,
            description: term.description ?? "",
            partOfSpeech: term.partOfSpeech ?? "",
            gender: term.gender ?? null,
            termType: term.type ?? null,
            url: term.url ?? null,
            lemma: term.lemma ?? null,
            status: term.status ?? "draft",
            provenance: "manual" as const,
          })),
        );
      }
      return concept;
    });
    return this.getConcept(created.id);
  }

  async updateConcept(conceptId: string, input: NativeGlossaryConcept) {
    const loaded = await this.loadConcept(conceptId);
    if (!loaded) return null;
    await db
      .update(schema.glossaryConcepts)
      .set({
        primaryTerm: input.primaryTerm,
        subject: input.subject ?? "",
        definition: input.definition ?? "",
        translatable: input.translatable ?? true,
        note: input.note ?? "",
        url: input.url || null,
        figure: input.figure || null,
        languageDetails: input.languageDetails ?? [],
      })
      .where(eq(schema.glossaryConcepts.id, conceptId));
    for (const term of input.terms) {
      const existing =
        typeof term.id === "string"
          ? loaded.terms.find((candidate) => candidate.id === term.id)
          : undefined;
      const values = {
        locale: term.languageId,
        term: term.text,
        sourceTerm: term.text,
        targetTerm: term.text,
        description: term.description ?? "",
        partOfSpeech: term.partOfSpeech ?? "",
        gender: term.gender ?? null,
        termType: term.type ?? null,
        url: term.url ?? null,
        lemma: term.lemma ?? null,
        status: term.status ?? "draft",
      };
      if (existing) {
        await db
          .update(schema.glossaryTerms)
          .set(values)
          .where(eq(schema.glossaryTerms.id, existing.id));
      } else {
        await db.insert(schema.glossaryTerms).values({
          glossaryId: this.input.glossary.id,
          conceptId,
          ...values,
          provenance: "manual" as const,
        });
      }
    }
    return this.getConcept(conceptId);
  }

  async deleteConcept(conceptId: string) {
    const deleted = await db
      .delete(schema.glossaryConcepts)
      .where(
        and(
          eq(schema.glossaryConcepts.id, conceptId),
          eq(schema.glossaryConcepts.glossaryId, this.input.glossary.id),
        ),
      )
      .returning({ id: schema.glossaryConcepts.id });
    return deleted.length > 0;
  }

  async createTerm(conceptId: string, input: NativeGlossaryTermInput) {
    const [term] = await db
      .insert(schema.glossaryTerms)
      .values({
        glossaryId: this.input.glossary.id,
        conceptId,
        locale: input.languageId,
        term: input.text,
        sourceTerm: input.text,
        targetTerm: input.text,
        description: input.description ?? "",
        partOfSpeech: input.partOfSpeech ?? "",
        gender: input.gender ?? null,
        termType: input.type ?? null,
        url: input.url ?? null,
        lemma: input.lemma ?? null,
        status: input.status ?? "draft",
        provenance: "manual" as const,
      })
      .returning();
    return term ? this.toTermRecord(term) : null;
  }

  async updateTerm(conceptId: string, termId: string, input: NativeGlossaryTermInput) {
    const [term] = await db
      .update(schema.glossaryTerms)
      .set({
        locale: input.languageId,
        term: input.text,
        sourceTerm: input.text,
        targetTerm: input.text,
        description: input.description ?? "",
        partOfSpeech: input.partOfSpeech ?? "",
        gender: input.gender ?? null,
        termType: input.type ?? null,
        url: input.url ?? null,
        lemma: input.lemma ?? null,
        status: input.status ?? "draft",
      })
      .where(
        and(
          eq(schema.glossaryTerms.id, termId),
          eq(schema.glossaryTerms.conceptId, conceptId),
          eq(schema.glossaryTerms.glossaryId, this.input.glossary.id),
        ),
      )
      .returning();
    return term ? this.toTermRecord(term) : null;
  }

  async deleteTerm(conceptId: string, termId: string) {
    const deleted = await db
      .delete(schema.glossaryTerms)
      .where(
        and(
          eq(schema.glossaryTerms.id, termId),
          eq(schema.glossaryTerms.conceptId, conceptId),
          eq(schema.glossaryTerms.glossaryId, this.input.glossary.id),
        ),
      )
      .returning({ id: schema.glossaryTerms.id });
    return deleted.length > 0;
  }
}
