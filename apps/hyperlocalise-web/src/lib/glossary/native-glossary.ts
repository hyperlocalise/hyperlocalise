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
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type {
  GlossaryTermCreateInput,
  GlossaryTermRecord,
  GlossaryTermUpdateInput,
  GlossaryConceptImportEntry,
  NativeGlossaryConcept,
  NativeGlossaryTermInput,
} from "./glossary";
import { Glossary } from "./glossary";
import type { GlossaryProviderContext } from "./glossary-provider";
import { createGlossaryTermDuplicateTracker } from "./glossary-term-dedupe";

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

  private toGlossaryTermRecord(term: typeof schema.glossaryTerms.$inferSelect): GlossaryTermRecord {
    return {
      id: term.id,
      glossaryId: term.glossaryId,
      glossaryName: this.input.glossary.name,
      sourceTerm: term.sourceTerm,
      targetTerm: term.targetTerm,
      targetLocale: this.input.glossary.targetLocale,
      description: term.description,
      partOfSpeech: term.partOfSpeech,
      url: term.url,
      lemma: term.lemma,
      forbidden: term.forbidden,
      caseSensitive: term.caseSensitive,
      provenance: term.provenance,
      externalKey: null,
      reviewStatus: term.reviewStatus,
    };
  }

  async importConcepts(entries: GlossaryConceptImportEntry[]) {
    const result = await db.transaction(async (tx) => {
      const importedIds: string[] = [];
      let skipped = 0;
      const grouped = new Map<string, GlossaryConceptImportEntry[]>();
      for (const entry of entries) {
        grouped.set(entry.conceptKey, [...(grouped.get(entry.conceptKey) ?? []), entry]);
      }

      for (const group of grouped.values()) {
        const first = group[0];
        if (!first) continue;
        const [existing] = await tx
          .select()
          .from(schema.glossaryConcepts)
          .where(
            and(
              eq(schema.glossaryConcepts.glossaryId, this.input.glossary.id),
              eq(schema.glossaryConcepts.primaryTerm, first.term),
            ),
          )
          .limit(1);
        const concept =
          existing ??
          (
            await tx
              .insert(schema.glossaryConcepts)
              .values({
                glossaryId: this.input.glossary.id,
                primaryTerm:
                  group.find((entry) => entry.locale === this.input.glossary.sourceLocale)?.term ??
                  first.term,
                subject: first.subject ?? "",
                definition: first.definition ?? "",
                translatable: first.translatable ?? true,
                note: first.note ?? "",
                url: first.url || null,
              })
              .returning()
          )[0];
        if (!concept) continue;
        if (!existing) importedIds.push(concept.id);

        for (const entry of group) {
          const [duplicate] = await tx
            .select({ id: schema.glossaryTerms.id })
            .from(schema.glossaryTerms)
            .where(
              and(
                eq(schema.glossaryTerms.conceptId, concept.id),
                eq(schema.glossaryTerms.locale, entry.locale),
                sql`lower(${schema.glossaryTerms.term}) = lower(${entry.term})`,
              ),
            )
            .limit(1);
          if (duplicate) {
            skipped += 1;
            continue;
          }
          await tx.insert(schema.glossaryTerms).values({
            glossaryId: this.input.glossary.id,
            conceptId: concept.id,
            locale: entry.locale,
            term: entry.term,
            sourceTerm: entry.term,
            targetTerm: entry.term,
            description: entry.definition ?? "",
            partOfSpeech: entry.partOfSpeech ?? "",
            gender: entry.gender ?? null,
            termType: entry.termType ?? null,
            status:
              entry.status ??
              (entry.locale === this.input.glossary.sourceLocale ? "preferred" : "draft"),
            caseSensitive: false,
            forbidden: false,
          });
        }
      }
      return { importedIds, skipped };
    });
    const concepts = [];
    for (const id of result.importedIds) {
      const concept = await this.getConcept(id);
      if (concept) concepts.push(concept);
    }
    return { concepts, skipped: result.skipped };
  }

  async listTerms() {
    const terms = await db
      .select()
      .from(schema.glossaryTerms)
      .where(
        and(
          eq(schema.glossaryTerms.glossaryId, this.input.glossary.id),
          isNull(schema.glossaryTerms.conceptId),
        ),
      );
    return terms.map((term) => this.toGlossaryTermRecord(term));
  }

  async createGlossaryTerm(input: GlossaryTermCreateInput) {
    const duplicate = await db
      .select({ id: schema.glossaryTerms.id })
      .from(schema.glossaryTerms)
      .where(
        and(
          eq(schema.glossaryTerms.glossaryId, this.input.glossary.id),
          isNull(schema.glossaryTerms.conceptId),
          input.caseSensitive
            ? eq(schema.glossaryTerms.sourceTerm, input.sourceTerm)
            : sql`lower(${schema.glossaryTerms.sourceTerm}) = lower(${input.sourceTerm})`,
        ),
      )
      .limit(1);
    if (duplicate.length > 0) return null;

    const [term] = await db
      .insert(schema.glossaryTerms)
      .values({
        glossaryId: this.input.glossary.id,
        sourceTerm: input.sourceTerm,
        targetTerm: input.targetTerm,
        description: input.description ?? "",
        partOfSpeech: input.partOfSpeech ?? "",
        url: input.url || null,
        lemma: input.lemma ?? null,
        caseSensitive: input.caseSensitive,
        forbidden: input.forbidden,
      })
      .returning();
    return term ? this.toGlossaryTermRecord(term) : null;
  }

  async createGlossaryTerms(inputs: GlossaryTermCreateInput[]) {
    if (inputs.length === 0) return { created: [], skipped: 0 };
    const existing = await db
      .select({ sourceTerm: schema.glossaryTerms.sourceTerm })
      .from(schema.glossaryTerms)
      .where(
        and(
          eq(schema.glossaryTerms.glossaryId, this.input.glossary.id),
          isNull(schema.glossaryTerms.conceptId),
        ),
      );
    const tracker = createGlossaryTermDuplicateTracker(existing);
    const values = inputs
      .filter((input) => !tracker.hasDuplicateAndTrack(input))
      .map((input) => ({
        glossaryId: this.input.glossary.id,
        sourceTerm: input.sourceTerm,
        targetTerm: input.targetTerm,
        description: input.description ?? "",
        partOfSpeech: input.partOfSpeech ?? "",
        url: input.url || null,
        lemma: input.lemma ?? null,
        caseSensitive: input.caseSensitive,
        forbidden: input.forbidden,
      }));
    const created =
      values.length === 0 ? [] : await db.insert(schema.glossaryTerms).values(values).returning();
    return {
      created: created.map((term) => this.toGlossaryTermRecord(term)),
      skipped: inputs.length - created.length,
    };
  }

  async updateGlossaryTerm(termId: string, input: GlossaryTermUpdateInput) {
    if (input.sourceTerm !== undefined) {
      const duplicate = await db
        .select({ id: schema.glossaryTerms.id })
        .from(schema.glossaryTerms)
        .where(
          and(
            eq(schema.glossaryTerms.glossaryId, this.input.glossary.id),
            ne(schema.glossaryTerms.id, termId),
            isNull(schema.glossaryTerms.conceptId),
            input.caseSensitive
              ? eq(schema.glossaryTerms.sourceTerm, input.sourceTerm)
              : sql`lower(${schema.glossaryTerms.sourceTerm}) = lower(${input.sourceTerm})`,
          ),
        )
        .limit(1);
      if (duplicate.length > 0) return { error: "duplicate" as const };
    }
    const [term] = await db
      .update(schema.glossaryTerms)
      .set(input)
      .where(
        and(
          eq(schema.glossaryTerms.id, termId),
          eq(schema.glossaryTerms.glossaryId, this.input.glossary.id),
          isNull(schema.glossaryTerms.conceptId),
        ),
      )
      .returning();
    return term ? this.toGlossaryTermRecord(term) : null;
  }

  async deleteGlossaryTerm(termId: string) {
    const deleted = await db
      .delete(schema.glossaryTerms)
      .where(
        and(
          eq(schema.glossaryTerms.id, termId),
          eq(schema.glossaryTerms.glossaryId, this.input.glossary.id),
          isNull(schema.glossaryTerms.conceptId),
        ),
      )
      .returning({ id: schema.glossaryTerms.id });
    return deleted.length > 0;
  }

  async attachProject(projectId: string, priority: number) {
    await db
      .insert(schema.projectGlossaries)
      .values({
        organizationId: this.input.auth.organization.localOrganizationId,
        projectId,
        glossaryId: this.input.glossary.id,
        priority,
      })
      .onConflictDoUpdate({
        target: [schema.projectGlossaries.projectId, schema.projectGlossaries.glossaryId],
        set: { priority },
      });
  }

  async detachProject(projectId: string) {
    await db
      .delete(schema.projectGlossaries)
      .where(
        and(
          eq(
            schema.projectGlossaries.organizationId,
            this.input.auth.organization.localOrganizationId,
          ),
          eq(schema.projectGlossaries.projectId, projectId),
          eq(schema.projectGlossaries.glossaryId, this.input.glossary.id),
        ),
      );
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
