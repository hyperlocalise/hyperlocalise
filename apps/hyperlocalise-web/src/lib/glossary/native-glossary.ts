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
import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import { db, schema, type DatabaseClient } from "@/lib/database/client";
import type { Glossary as GlossaryRecord } from "@/lib/database/types";
import { queryNativeGlossaryHasTermsAtLocale } from "@/lib/glossary/query-glossary-term-counts";
import {
  glossaryTermFlagsFromStatus,
  normalizedGlossaryTermStatusFromStatus,
} from "@/lib/providers/contracts/glossary-term-status";
import {
  hasGlossaryExpectedTarget,
  normalizeSyncedDatabaseGlossaryMatch,
  type NormalizedGlossaryConcept,
  type NormalizedGlossaryConceptTerm,
  type NormalizedGlossaryMatch,
} from "@/lib/providers/contracts/glossary-match";
import { buildGlossaryTsQuery } from "./glossary";
import type { GlossaryProviderContext } from "./glossary-provider";
import { sourceContainsTerm } from "@/lib/glossary/validate-glossary-terms-in-translation";
import {
  Glossary,
  normalizeGlossaryGender,
  normalizeGlossaryPartOfSpeech,
  normalizeGlossaryTermStatus,
  normalizeGlossaryTermType,
  selectGlossaryPrimaryTerm,
  type GlossaryConcordanceContext,
  type GlossaryConcordanceQuery,
} from "./glossary";
import type {
  GlossaryConceptImportEntry,
  GlossaryConcept,
  GlossaryConceptInput,
  NativeGlossaryTermInput,
  GlossaryProjectRecord,
} from "./glossary";

const concordanceSourceTerms = alias(schema.glossaryTerms, "concordance_native_source_terms");

type GlossaryTermRow = typeof schema.glossaryTerms.$inferSelect;
type GlossaryConceptRow = typeof schema.glossaryConcepts.$inferSelect;

type NativeConceptSourceHit = {
  conceptId: string;
  glossaryId: string;
  glossaryName: string;
  matchedSourceTermId: string;
  matchedSourceTerm: string;
  caseSensitive: boolean;
  sourceStatus: string | null;
  rank: number;
  externalGlossaryUrl: string | null;
};

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

function toNativeConcordanceConceptTerm(row: GlossaryTermRow): NormalizedGlossaryConceptTerm {
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

export function filterConcordanceTargetTerms<T extends { locale: string }>(
  terms: T[],
  targetLocales: string[],
): T[] {
  if (targetLocales.length === 0) {
    return [];
  }

  const allowedLocales = new Set(targetLocales);
  return terms.filter((term) => allowedLocales.has(term.locale));
}

function buildNormalizedConcept(input: {
  concept: GlossaryConceptRow;
  terms: GlossaryTermRow[];
  sourceLocale: string;
  targetLocales: string[];
  glossaryUrl: string | null;
}): NormalizedGlossaryConcept {
  const conceptTerms = input.terms.map(toNativeConcordanceConceptTerm);
  return {
    id: input.concept.id,
    primaryTerm: input.concept.primaryTerm,
    subject: input.concept.subject,
    definition: input.concept.definition,
    glossaryUrl: input.glossaryUrl ?? null,
    translatable: input.concept.translatable ?? true,
    sourceTerms: conceptTerms.filter((term) => term.locale === input.sourceLocale),
    targetTerms: filterConcordanceTargetTerms(conceptTerms, input.targetLocales),
  };
}

function normalizeNativeConcept(input: GlossaryConcept): GlossaryConcept {
  let terms = input.terms.map((term) => ({
    ...term,
    partOfSpeech: normalizeGlossaryPartOfSpeech(term.partOfSpeech, { required: false }),
  }));

  let primaryTerm = selectGlossaryPrimaryTerm(terms, input.sourceLocale);
  const hasPreferredSourceTerm = terms.some(
    (term) =>
      term.locale === input.sourceLocale &&
      term.status?.trim().toLowerCase().replaceAll(" ", "_") === "preferred",
  );
  if (!primaryTerm && input.primaryTerm) {
    const sourcePartOfSpeech = terms.find((term) => term.partOfSpeech)?.partOfSpeech;
    terms.push({
      locale: input.sourceLocale,
      text: input.primaryTerm,
      partOfSpeech: sourcePartOfSpeech,
      status: "preferred",
    });
    primaryTerm = terms.at(-1);
  }

  if (primaryTerm && input.primaryTerm) {
    terms = terms.map((term) =>
      term === primaryTerm
        ? {
            ...term,
            text: input.primaryTerm,
            status: hasPreferredSourceTerm ? term.status : "preferred",
          }
        : term.locale === input.sourceLocale && term.status === "preferred"
          ? { ...term, status: "admitted" }
          : term,
    );
  }

  return {
    ...input,
    terms,
  };
}

function toNativeConceptInput(input: GlossaryConceptInput, sourceLocale: string): GlossaryConcept {
  return {
    primaryTerm: input.primaryTerm ?? "",
    sourceLocale,
    subject: input.subject,
    definition: input.definition,
    translatable: input.translatable,
    note: input.note,
    url: input.url,
    figure: input.figure,
    terms: (input.terms ?? []).map((term) => {
      if ("term" in term) {
        return {
          id: term.id,
          locale: term.locale,
          text: term.term,
          description: term.description,
          note: term.note,
          partOfSpeech: term.partOfSpeech,
          status: term.status,
          type: term.termType ?? undefined,
          gender: term.gender ?? undefined,
          url: term.url || undefined,
          lemma: term.lemma ?? undefined,
        };
      }
      return { ...term };
    }),
  };
}

function normalizeNativeTerm(input: NativeGlossaryTermInput): NativeGlossaryTermInput {
  return {
    ...input,
    partOfSpeech: normalizeGlossaryPartOfSpeech(input.partOfSpeech, { required: false }),
  };
}

export class NativeGlossary extends Glossary {
  readonly kind = "native" as const;

  constructor(private readonly input: GlossaryProviderContext) {
    super();
  }

  get id() {
    return this.input.glossary.id;
  }

  async queryProjectCount() {
    const [row] = await db
      .select({ projectCount: count() })
      .from(schema.projectGlossaries)
      .where(eq(schema.projectGlossaries.glossaryId, this.input.glossary.id));

    return Number(row?.projectCount ?? 0);
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

  async listProjects(): Promise<GlossaryProjectRecord[]> {
    const accessibleProjectsWhere = await buildAccessibleProjectsWhere(this.input.auth);
    const attachedProjects = await db
      .select({
        projectId: schema.projects.id,
        projectName: schema.projects.name,
        priority: schema.projectGlossaries.priority,
        sourceLocale: schema.projects.sourceLocale,
        targetLocales: schema.projects.targetLocales,
        source: schema.projects.source,
      })
      .from(schema.projectGlossaries)
      .innerJoin(schema.projects, eq(schema.projectGlossaries.projectId, schema.projects.id))
      .where(
        and(
          eq(
            schema.projectGlossaries.organizationId,
            this.input.auth.organization.localOrganizationId,
          ),
          eq(schema.projectGlossaries.glossaryId, this.input.glossary.id),
          accessibleProjectsWhere,
        ),
      )
      .orderBy(schema.projectGlossaries.priority, schema.projects.name);

    return attachedProjects.map((project) => ({ ...project, externalUrl: null }));
  }

  async update(payload: { name?: string; description?: string; sourceLocale?: string }) {
    const updates = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(updates).length === 0) {
      return this.input.glossary;
    }
    const [glossary] = await db
      .update(schema.glossaries)
      .set(updates)
      .where(
        and(
          eq(schema.glossaries.id, this.input.glossary.id),
          eq(schema.glossaries.organizationId, this.input.auth.organization.localOrganizationId),
        ),
      )
      .returning();
    return glossary ?? null;
  }

  async updateWithAttachmentGuard(payload: {
    name?: string;
    description?: string;
    sourceLocale?: string;
  }): Promise<
    | { status: "updated"; glossary: GlossaryRecord }
    | { status: "not_found" }
    | { status: "source_locale_attached_projects" }
    | { status: "source_locale_existing_terms" }
  > {
    const updates = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(updates).length === 0) {
      return { status: "updated", glossary: this.input.glossary };
    }

    const needsAttachmentValidation =
      payload.sourceLocale !== undefined &&
      payload.sourceLocale !== this.input.glossary.sourceLocale;

    if (!needsAttachmentValidation) {
      const glossary = await this.update(payload);
      return glossary ? { status: "updated", glossary } : { status: "not_found" };
    }

    const accessibleProjectsWhere = await buildAccessibleProjectsWhere(this.input.auth);

    return db.transaction(async (tx) => {
      const [glossaryRow] = await tx
        .select({
          sourceLocale: schema.glossaries.sourceLocale,
        })
        .from(schema.glossaries)
        .where(
          and(
            eq(schema.glossaries.id, this.input.glossary.id),
            eq(schema.glossaries.organizationId, this.input.auth.organization.localOrganizationId),
          ),
        )
        .limit(1)
        .for("update");

      if (!glossaryRow) {
        return { status: "not_found" };
      }

      if (
        payload.sourceLocale !== undefined &&
        payload.sourceLocale !== glossaryRow.sourceLocale &&
        (await queryNativeGlossaryHasTermsAtLocale(
          this.input.glossary.id,
          glossaryRow.sourceLocale,
          tx,
        ))
      ) {
        return { status: "source_locale_existing_terms" };
      }

      const attachments = await tx
        .select({
          sourceLocale: schema.projects.sourceLocale,
        })
        .from(schema.projectGlossaries)
        .innerJoin(schema.projects, eq(schema.projectGlossaries.projectId, schema.projects.id))
        .where(
          and(
            eq(
              schema.projectGlossaries.organizationId,
              this.input.auth.organization.localOrganizationId,
            ),
            eq(schema.projectGlossaries.glossaryId, this.input.glossary.id),
            accessibleProjectsWhere,
          ),
        );

      if (
        payload.sourceLocale !== undefined &&
        payload.sourceLocale !== glossaryRow.sourceLocale &&
        attachments.some((attachment) => attachment.sourceLocale !== payload.sourceLocale)
      ) {
        return { status: "source_locale_attached_projects" };
      }

      const [glossary] = await tx
        .update(schema.glossaries)
        .set(updates)
        .where(
          and(
            eq(schema.glossaries.id, this.input.glossary.id),
            eq(schema.glossaries.organizationId, this.input.auth.organization.localOrganizationId),
          ),
        )
        .returning();

      return glossary ? { status: "updated", glossary } : { status: "not_found" };
    });
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

  private async lockGlossaryRow(database: DatabaseClient = db) {
    const [glossaryRow] = await database
      .select({
        id: schema.glossaries.id,
        sourceLocale: schema.glossaries.sourceLocale,
      })
      .from(schema.glossaries)
      .where(
        and(
          eq(schema.glossaries.id, this.input.glossary.id),
          eq(schema.glossaries.organizationId, this.input.auth.organization.localOrganizationId),
        ),
      )
      .limit(1)
      .for("update");

    return glossaryRow ?? null;
  }

  private async loadConcept(conceptId: string, database: DatabaseClient = db) {
    const [concept] = await database
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

    const terms = await database
      .select()
      .from(schema.glossaryTerms)
      .where(eq(schema.glossaryTerms.conceptId, concept.id));
    return { concept, terms };
  }

  private toConceptRecord(
    loaded: NonNullable<Awaited<ReturnType<NativeGlossary["loadConcept"]>>>,
  ): GlossaryConcept {
    return {
      primaryTerm:
        selectGlossaryPrimaryTerm(
          loaded.terms.map((term) => ({
            id: term.id,
            locale: term.locale ?? "",
            text: term.term ?? term.sourceTerm,
            status: term.status,
          })),
          this.input.glossary.sourceLocale,
        )?.text ?? loaded.concept.primaryTerm,
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
      languageDetails: loaded.concept.languageDetails?.map((detail) => ({
        locale: detail.locale,
        userId: detail.userId,
        definition: detail.definition,
        note: detail.note,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
      })),
      terms: loaded.terms.map((term) => ({
        id: term.id,
        locale: term.locale ?? "",
        text: term.term ?? term.sourceTerm,
        description: term.description,
        partOfSpeech: term.partOfSpeech,
        status: normalizeGlossaryTermStatus(term.status),
        type: normalizeGlossaryTermType(term.termType),
        gender: normalizeGlossaryGender(term.gender),
        note: term.note,
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
      locale: term.locale ?? "",
      text: term.term ?? term.sourceTerm,
      description: term.description,
      partOfSpeech: term.partOfSpeech,
      status: normalizeGlossaryTermStatus(term.status),
      type: normalizeGlossaryTermType(term.termType),
      gender: normalizeGlossaryGender(term.gender),
      note: term.note,
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

  async createConcept(input: GlossaryConceptInput) {
    const normalizedInput = normalizeNativeConcept(
      toNativeConceptInput(input, this.input.glossary.sourceLocale),
    );
    const created = await db.transaction(async (tx) => {
      if (!(await this.lockGlossaryRow(tx))) {
        return null;
      }

      const [concept] = await tx
        .insert(schema.glossaryConcepts)
        .values({
          glossaryId: this.input.glossary.id,
          primaryTerm: normalizedInput.primaryTerm,
          subject: normalizedInput.subject ?? "",
          definition: normalizedInput.definition ?? "",
          translatable: normalizedInput.translatable ?? true,
          note: normalizedInput.note ?? "",
          url: normalizedInput.url || null,
          figure: normalizedInput.figure || null,
          languageDetails: normalizedInput.languageDetails ?? [],
        })
        .returning();
      if (normalizedInput.terms.length > 0) {
        await tx.insert(schema.glossaryTerms).values(
          normalizedInput.terms.map((term) => ({
            glossaryId: this.input.glossary.id,
            conceptId: concept.id,
            locale: term.locale,
            term: term.text,
            sourceTerm: term.text,
            targetTerm: term.text,
            description: term.description ?? "",
            note: term.note ?? "",
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
    if (!created) {
      return null;
    }
    return this.getConcept(created.id);
  }

  async updateConcept(conceptId: string, input: GlossaryConceptInput) {
    const normalizedInput = normalizeNativeConcept(
      toNativeConceptInput(input, this.input.glossary.sourceLocale),
    );
    const updated = await db.transaction(async (tx) => {
      if (!(await this.lockGlossaryRow(tx))) {
        return false;
      }

      const loaded = await this.loadConcept(conceptId, tx);
      if (!loaded) return false;

      await tx
        .update(schema.glossaryConcepts)
        .set({
          primaryTerm: normalizedInput.primaryTerm,
          subject: normalizedInput.subject ?? "",
          definition: normalizedInput.definition ?? "",
          translatable: normalizedInput.translatable ?? true,
          note: normalizedInput.note ?? "",
          url: normalizedInput.url || null,
          figure: normalizedInput.figure || null,
          languageDetails: normalizedInput.languageDetails ?? [],
        })
        .where(eq(schema.glossaryConcepts.id, conceptId));
      // Match Crowdin concept PATCH reconcile: terms present in the payload are
      // upserted; existing concept terms omitted from the payload are deleted.
      // The glossary UI defers term deletion until Save by omitting those ids.
      const retainedIds = new Set<string>();
      for (const term of normalizedInput.terms) {
        const existing =
          typeof term.id === "string"
            ? loaded.terms.find((candidate) => candidate.id === term.id)
            : undefined;
        const values = {
          locale: term.locale,
          term: term.text,
          sourceTerm: term.text,
          targetTerm: term.text,
          description: term.description ?? "",
          note: term.note ?? "",
          partOfSpeech: term.partOfSpeech ?? "",
          gender: term.gender ?? null,
          termType: term.type ?? null,
          url: term.url ?? null,
          lemma: term.lemma ?? null,
          status: term.status ?? "draft",
        };
        if (existing) {
          retainedIds.add(existing.id);
          await tx
            .update(schema.glossaryTerms)
            .set(values)
            .where(eq(schema.glossaryTerms.id, existing.id));
        } else {
          await tx.insert(schema.glossaryTerms).values({
            glossaryId: this.input.glossary.id,
            conceptId,
            ...values,
            provenance: "manual" as const,
          });
        }
      }

      const orphanIds = loaded.terms
        .map((term) => term.id)
        .filter((termId) => !retainedIds.has(termId));
      if (orphanIds.length > 0) {
        await tx
          .delete(schema.glossaryTerms)
          .where(
            and(
              eq(schema.glossaryTerms.glossaryId, this.input.glossary.id),
              eq(schema.glossaryTerms.conceptId, conceptId),
              inArray(schema.glossaryTerms.id, orphanIds),
            ),
          );
      }
      return true;
    });
    if (!updated) return null;
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

  async importConcepts(entries: GlossaryConceptImportEntry[]) {
    const result = await db.transaction(async (tx) => {
      if (!(await this.lockGlossaryRow(tx))) {
        return { importedIds: [] as string[], skipped: entries.length };
      }

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
            partOfSpeech:
              normalizeGlossaryPartOfSpeech(entry.partOfSpeech, { required: false }) ?? "",
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

  async attachProjectWithGuard(
    projectId: string,
    priority: number,
    _project: { source: string; sourceLocale: string },
  ): Promise<
    | { status: "attached" }
    | { status: "not_found" }
    | { status: "team_native_project_required" }
    | { status: "source_locale_mismatch" }
  > {
    const organizationId = this.input.auth.organization.localOrganizationId;

    return db.transaction(async (tx) => {
      const [projectRow] = await tx
        .select({
          source: schema.projects.source,
          sourceLocale: schema.projects.sourceLocale,
          teamId: schema.projects.teamId,
        })
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.id, projectId),
            eq(schema.projects.organizationId, organizationId),
          ),
        )
        .limit(1)
        .for("update");

      if (!projectRow?.sourceLocale) {
        return { status: "source_locale_mismatch" };
      }

      const [glossaryRow] = await tx
        .select({
          controlLevel: schema.glossaries.controlLevel,
          sourceLocale: schema.glossaries.sourceLocale,
          teamId: schema.glossaries.teamId,
        })
        .from(schema.glossaries)
        .where(
          and(
            eq(schema.glossaries.id, this.input.glossary.id),
            eq(schema.glossaries.organizationId, organizationId),
          ),
        )
        .limit(1)
        .for("update");

      if (!glossaryRow) {
        return { status: "not_found" };
      }

      if (projectRow.sourceLocale !== glossaryRow.sourceLocale) {
        return { status: "source_locale_mismatch" };
      }

      if (glossaryRow.controlLevel === "team" && projectRow.source !== "native") {
        return { status: "team_native_project_required" };
      }

      await tx
        .insert(schema.projectGlossaries)
        .values({
          organizationId,
          projectId,
          glossaryId: this.input.glossary.id,
          priority,
        })
        .onConflictDoUpdate({
          target: [schema.projectGlossaries.projectId, schema.projectGlossaries.glossaryId],
          set: { priority },
        });

      return { status: "attached" };
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

  async detachProjectWithTeamGuard(
    projectId: string,
  ): Promise<"detached" | "team_project_required" | "not_attached"> {
    return db.transaction(async (tx) => {
      const [glossaryRow] = await tx
        .select({ controlLevel: schema.glossaries.controlLevel })
        .from(schema.glossaries)
        .where(
          and(
            eq(schema.glossaries.id, this.input.glossary.id),
            eq(schema.glossaries.organizationId, this.input.auth.organization.localOrganizationId),
          ),
        )
        .limit(1)
        .for("update");

      if (!glossaryRow) {
        return "not_attached";
      }

      const attachments = await tx
        .select({
          projectId: schema.projects.id,
          source: schema.projects.source,
        })
        .from(schema.projectGlossaries)
        .innerJoin(schema.projects, eq(schema.projectGlossaries.projectId, schema.projects.id))
        .where(
          and(
            eq(
              schema.projectGlossaries.organizationId,
              this.input.auth.organization.localOrganizationId,
            ),
            eq(schema.projectGlossaries.glossaryId, this.input.glossary.id),
          ),
        );

      const target = attachments.find((attachment) => attachment.projectId === projectId);
      if (!target) {
        return "not_attached";
      }

      if (glossaryRow.controlLevel === "team") {
        const nativeCount = attachments.filter(
          (attachment) => attachment.source === "native",
        ).length;
        if (target.source === "native" && nativeCount <= 1) {
          return "team_project_required";
        }
      }

      await tx
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

      return "detached";
    });
  }

  async createTerm(conceptId: string, input: NativeGlossaryTermInput) {
    const normalizedInput = normalizeNativeTerm(input);
    const term = await db.transaction(async (tx) => {
      if (!(await this.lockGlossaryRow(tx))) {
        return null;
      }

      const concept = await this.loadConcept(conceptId, tx);
      if (!concept) return null;

      const [created] = await tx
        .insert(schema.glossaryTerms)
        .values({
          glossaryId: this.input.glossary.id,
          conceptId,
          locale: normalizedInput.locale,
          term: normalizedInput.text,
          sourceTerm: normalizedInput.text,
          targetTerm: normalizedInput.text,
          description: normalizedInput.description ?? "",
          note: normalizedInput.note ?? "",
          partOfSpeech: normalizedInput.partOfSpeech ?? "",
          gender: normalizedInput.gender ?? null,
          termType: normalizedInput.type ?? null,
          url: normalizedInput.url ?? null,
          lemma: normalizedInput.lemma ?? null,
          status: normalizedInput.status ?? "draft",
          provenance: "manual" as const,
        })
        .returning();
      return created ?? null;
    });
    return term ? this.toTermRecord(term) : null;
  }

  async updateTerm(conceptId: string, termId: string, input: NativeGlossaryTermInput) {
    const normalizedInput = normalizeNativeTerm(input);
    const [term] = await db
      .update(schema.glossaryTerms)
      .set({
        locale: normalizedInput.locale,
        term: normalizedInput.text,
        sourceTerm: normalizedInput.text,
        targetTerm: normalizedInput.text,
        description: normalizedInput.description ?? "",
        note: normalizedInput.note ?? "",
        partOfSpeech: normalizedInput.partOfSpeech ?? "",
        gender: normalizedInput.gender ?? null,
        termType: normalizedInput.type ?? null,
        url: normalizedInput.url ?? null,
        lemma: normalizedInput.lemma ?? null,
        status: normalizedInput.status ?? "draft",
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

  async searchConcordance(
    query: GlossaryConcordanceQuery,
    _ctx: GlossaryConcordanceContext,
  ): Promise<NormalizedGlossaryMatch[]> {
    const tsQuery = buildGlossaryTsQuery(query.sourceText);
    if (!tsQuery) {
      return [];
    }

    const limit = query.limit ?? 20;
    const glossaryId = this.input.glossary.id;
    const sourceLocale = query.sourceLocale;

    const sourceHits = await db
      .select({
        conceptId: concordanceSourceTerms.conceptId,
        glossaryId: concordanceSourceTerms.glossaryId,
        glossaryName: schema.glossaries.name,
        matchedSourceTermId: concordanceSourceTerms.id,
        matchedSourceTerm: sql<string>`${concordanceSourceTerms.term}`,
        caseSensitive: concordanceSourceTerms.caseSensitive,
        sourceStatus: concordanceSourceTerms.status,
        rank: sql<number>`ts_rank(${concordanceSourceTerms.searchVector}, to_tsquery('simple', ${tsQuery}))`.as(
          "rank",
        ),
        externalGlossaryUrl: schema.glossaries.externalUrl,
      })
      .from(concordanceSourceTerms)
      .innerJoin(schema.glossaries, eq(concordanceSourceTerms.glossaryId, schema.glossaries.id))
      .where(
        and(
          eq(concordanceSourceTerms.glossaryId, glossaryId),
          eq(schema.glossaries.source, "native"),
          eq(schema.glossaries.sourceLocale, sourceLocale),
          eq(schema.glossaries.status, "active"),
          eq(concordanceSourceTerms.locale, sourceLocale),
          // Concordance is concept-backed only. Leftover term-based rows (conceptId = null)
          // are intentionally excluded.
          isNotNull(concordanceSourceTerms.conceptId),
          isNotNull(concordanceSourceTerms.term),
          eq(concordanceSourceTerms.reviewStatus, "approved"),
          sql`${concordanceSourceTerms.searchVector} @@ to_tsquery('simple', ${tsQuery})`,
          sql`case
            when coalesce(${concordanceSourceTerms.caseSensitive}, false)
              then position(${concordanceSourceTerms.term} in ${query.sourceText}) > 0
            else position(lower(${concordanceSourceTerms.term}) in lower(${query.sourceText})) > 0
          end`,
        ),
      )
      .orderBy(desc(sql`rank`))
      .limit(limit);

    const filteredHits: NativeConceptSourceHit[] = sourceHits.flatMap((row) =>
      row.conceptId &&
      sourceContainsTerm(query.sourceText, {
        sourceTerm: row.matchedSourceTerm,
        caseSensitive: row.caseSensitive ?? false,
      })
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
              externalGlossaryUrl: row.externalGlossaryUrl,
            },
          ]
        : [],
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
        .where(
          and(
            inArray(schema.glossaryTerms.conceptId, conceptIds),
            eq(schema.glossaryTerms.reviewStatus, "approved"),
            inArray(schema.glossaryTerms.locale, [sourceLocale, ...query.targetLocales]),
          ),
        ),
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
        sourceLocale,
        targetLocales: query.targetLocales,
        glossaryUrl: null,
      });

      for (const targetLocale of query.targetLocales) {
        const isUntranslatable = concept.translatable === false;
        const preferredTarget = pickPreferredTermForLocale(
          normalizedConcept.targetTerms,
          targetLocale,
        );
        const sourceStatus = normalizedGlossaryTermStatusFromStatus(hit.sourceStatus);

        if (isUntranslatable) {
          matches.push(
            normalizeSyncedDatabaseGlossaryMatch({
              id: `${hit.matchedSourceTermId}:${targetLocale}`,
              glossaryId: hit.glossaryId,
              glossaryName: hit.glossaryName,
              sourceTerm: hit.matchedSourceTerm,
              targetTerm: hit.matchedSourceTerm,
              sourceLocale,
              targetLocale,
              description: concept.definition || null,
              forbidden: sourceStatus.forbidden,
              preferred: sourceStatus.preferred,
              caseSensitive: hit.caseSensitive ?? false,
              rank: hit.rank || 1,
              providerKind: null,
              externalResourceId: null,
              externalTermId: null,
              concept: normalizedConcept,
            }),
          );
          continue;
        }

        if (preferredTarget) {
          const targetStatus = normalizedGlossaryTermStatusFromStatus(preferredTarget.status);

          matches.push(
            normalizeSyncedDatabaseGlossaryMatch({
              id: `${hit.matchedSourceTermId}:${targetLocale}`,
              glossaryId: hit.glossaryId,
              glossaryName: hit.glossaryName,
              sourceTerm: hit.matchedSourceTerm,
              targetTerm: preferredTarget.text,
              sourceLocale,
              targetLocale,
              description: concept.definition || null,
              forbidden: sourceStatus.forbidden || targetStatus.forbidden,
              preferred: targetStatus.preferred,
              caseSensitive: hit.caseSensitive ?? false,
              rank: hit.rank || 1,
              providerKind: null,
              externalResourceId: null,
              externalTermId: null,
              concept: normalizedConcept,
            }),
          );
          continue;
        }

        matches.push(
          normalizeSyncedDatabaseGlossaryMatch({
            id: `${hit.matchedSourceTermId}:${targetLocale}`,
            glossaryId: hit.glossaryId,
            glossaryName: hit.glossaryName,
            sourceTerm: hit.matchedSourceTerm,
            targetTerm: "",
            sourceLocale,
            targetLocale,
            description: concept.definition || null,
            forbidden: sourceStatus.forbidden,
            preferred: false,
            caseSensitive: hit.caseSensitive ?? false,
            rank: hit.rank || 1,
            providerKind: null,
            externalResourceId: null,
            externalTermId: null,
            concept: normalizedConcept,
          }),
        );
      }
    }

    return matches
      .toSorted((left, right) => {
        const leftHasExpectedTarget = hasGlossaryExpectedTarget(left);
        const rightHasExpectedTarget = hasGlossaryExpectedTarget(right);
        if (leftHasExpectedTarget !== rightHasExpectedTarget) {
          return leftHasExpectedTarget ? -1 : 1;
        }
        return right.rank - left.rank;
      })
      .slice(0, limit);
  }
}
