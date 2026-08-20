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
import {
  crowdinTmsProvider,
  type CrowdinGlossaryConcept,
} from "@/lib/providers/adapters/crowdin/crowdin-provider";
import type { CrowdinGlossary as CrowdinGlossaryRecord } from "@/lib/providers/adapters/crowdin/crowdin-api";
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import {
  Glossary,
  normalizeGlossaryGender,
  normalizeGlossaryPartOfSpeech,
  normalizeGlossaryTermStatus,
  normalizeGlossaryTermType,
  selectGlossaryPrimaryTerm,
  type GlossaryConceptImportEntry,
  type GlossaryConcept,
  type GlossaryConceptTerm,
  type GlossaryConceptInput,
  type GlossaryTermCreateInput,
  type GlossaryTermRecord,
  type GlossaryTermUpdateInput,
  type NativeGlossary,
  type NativeGlossaryTermInput,
} from "./glossary";
import { parseId, resolveCrowdinContext, toCrowdinContext } from "./glossary-provider";
import type { GlossaryProviderContext } from "./glossary-provider";

function crowdinStatus(status: string | undefined) {
  switch (status) {
    case "preferred":
      return "preferred";
    case "admitted":
      return "admitted";
    case "not_recommended":
      return "not recommended";
    case "obsolete":
      return "obsolete";
    default:
      return "draft";
  }
}

function toGlossaryConceptInput(
  input: GlossaryConceptInput,
  sourceLocale: string,
): GlossaryConcept {
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
      if ("locale" in term) {
        return {
          id: term.id,
          languageId: term.locale,
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

export function toCrowdinConceptInput(concept: GlossaryConcept): CrowdinGlossaryConcept {
  const primaryTerm = selectGlossaryPrimaryTerm(concept.terms, concept.sourceLocale);
  const hasPreferredSourceTerm = concept.terms.some(
    (term) =>
      term.languageId === concept.sourceLocale &&
      term.status?.trim().toLowerCase().replaceAll(" ", "_") === "preferred",
  );
  const terms = concept.terms.map((term) => ({
    id: term.id,
    languageId: term.languageId,
    text: term === primaryTerm && concept.primaryTerm ? concept.primaryTerm : term.text,
    description: term.description,
    partOfSpeech: normalizeGlossaryPartOfSpeech(term.partOfSpeech),
    status:
      term === primaryTerm && term.languageId === concept.sourceLocale && !hasPreferredSourceTerm
        ? "preferred"
        : term !== primaryTerm &&
            term.languageId === concept.sourceLocale &&
            crowdinStatus(term.status) === "preferred"
          ? "admitted"
          : crowdinStatus(term.status),
    type: term.type,
    gender: term.gender,
    note: term.note,
    url: term.url || undefined,
    lemma: term.lemma,
  }));

  if (!terms.some((term) => term.languageId === concept.sourceLocale) && concept.primaryTerm) {
    const sourcePartOfSpeech = terms.find((term) => term.partOfSpeech)?.partOfSpeech;
    terms.push({
      id: undefined,
      languageId: concept.sourceLocale,
      text: concept.primaryTerm,
      description: undefined,
      partOfSpeech: sourcePartOfSpeech,
      status: "preferred",
      type: undefined,
      gender: undefined,
      note: undefined,
      url: undefined,
      lemma: undefined,
    });
  }

  return {
    ...concept,
    terms,
  };
}

function normalizeCrowdinTerm(term: NativeGlossaryTermInput): NativeGlossaryTermInput {
  return {
    ...term,
    partOfSpeech: normalizeGlossaryPartOfSpeech(term.partOfSpeech),
  };
}

export function toGlossaryConcept(concept: CrowdinGlossaryConcept): GlossaryConcept {
  return {
    ...concept,
    terms: concept.terms.map((term) => ({
      ...term,
      status: normalizeGlossaryTermStatus(term.status),
      type: normalizeGlossaryTermType(term.type),
      gender: normalizeGlossaryGender(term.gender),
    })),
  };
}

function toNativeGlossary(
  glossary: CrowdinGlossaryRecord,
  nativeGlossary: NativeGlossary,
): NativeGlossary {
  return {
    ...nativeGlossary,
    name: glossary.name,
    description: glossary.description ?? "",
    sourceLocale: glossary.languageId,
    targetLocale: glossary.languageIds.find((locale) => locale !== glossary.languageId) ?? null,
    localeCoverage: glossary.languageIds,
    termCount: glossary.terms,
    externalGlossaryId: String(glossary.id),
    externalUrl: glossary.webUrl,
  };
}

export class CrowdinGlossary extends Glossary {
  readonly kind = "crowdin" as const;

  constructor(private readonly input: GlossaryProviderContext) {
    super();
  }

  private async context() {
    return resolveCrowdinContext(this.input);
  }

  async validate() {
    await this.context();
  }

  async get() {
    const context = await this.context();
    const glossary = await crowdinTmsProvider.fetchLiveGlossary(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
    );
    return toNativeGlossary(glossary, this.input.glossary);
  }

  async update(payload: { name?: string; description?: string }) {
    const context = await this.context();
    const patches = Object.entries(payload).map(([key, value]) => ({
      op: "replace" as const,
      path: `/${key}`,
      value,
    }));
    const glossary = await crowdinTmsProvider.updateLiveGlossary(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      patches,
    );
    return toNativeGlossary(glossary, this.input.glossary);
  }

  async delete() {
    const context = await this.context();
    await crowdinTmsProvider.deleteLiveGlossary(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
    );
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

  async listConcepts() {
    const context = await this.context();
    const concepts = await crowdinTmsProvider.listLiveGlossaryConcepts(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
    );
    return concepts.map(toGlossaryConcept);
  }

  async getConcept(conceptId: string) {
    const context = await this.context();
    const concept = await crowdinTmsProvider.getLiveGlossaryConcept(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
    );
    return concept ? toGlossaryConcept(concept) : null;
  }

  async createConcept(input: GlossaryConceptInput) {
    const context = await this.context();
    const concept = toGlossaryConceptInput(input, this.input.glossary.sourceLocale);
    const created = await crowdinTmsProvider.createLiveGlossaryConcept(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      toCrowdinConceptInput(concept),
    );
    return created ? toGlossaryConcept(created) : null;
  }

  async updateConcept(conceptId: string, input: GlossaryConceptInput) {
    const context = await this.context();
    const concept = toGlossaryConceptInput(input, this.input.glossary.sourceLocale);
    const updated = await crowdinTmsProvider.updateLiveGlossaryConcept(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
      toCrowdinConceptInput(concept),
    );
    return updated ? toGlossaryConcept(updated) : null;
  }

  async deleteConcept(conceptId: string) {
    const context = await this.context();
    return crowdinTmsProvider.deleteLiveGlossaryConcept(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
    );
  }

  async importConcepts(entries: GlossaryConceptImportEntry[]) {
    const grouped = new Map<string, GlossaryConceptImportEntry[]>();
    for (const entry of entries) {
      grouped.set(entry.conceptKey, [...(grouped.get(entry.conceptKey) ?? []), entry]);
    }
    const concepts: GlossaryConcept[] = [];
    let skipped = 0;
    for (const group of grouped.values()) {
      const first = group[0];
      if (!first) continue;
      const created = await this.createConcept({
        primaryTerm:
          group.find((entry) => entry.locale === this.input.glossary.sourceLocale)?.term ??
          first.term,
        sourceLocale: this.input.glossary.sourceLocale,
        subject: first.subject,
        definition: first.definition,
        translatable: first.translatable,
        note: first.note,
        url: first.url,
        terms: group.map((entry) => ({
          languageId: entry.locale,
          text: entry.term,
          description: entry.definition,
          partOfSpeech: entry.partOfSpeech,
          gender: entry.gender ?? undefined,
          type: entry.termType ?? undefined,
          status: entry.status ?? "draft",
        })),
      });
      if (created) concepts.push(created);
      else skipped += group.length;
    }
    return { concepts, skipped };
  }

  private toLegacyTermRecord(
    term: GlossaryConceptTerm,
    conceptId: string,
    sourceTerm: string,
  ): GlossaryTermRecord {
    return {
      id: String(term.id),
      glossaryId: this.input.glossary.id,
      glossaryName: this.input.glossary.name,
      sourceTerm,
      targetTerm: term.text,
      targetLocale: term.languageId,
      description: term.description ?? "",
      partOfSpeech: term.partOfSpeech ?? "",
      url: term.url ?? null,
      lemma: term.lemma ?? null,
      forbidden: false,
      caseSensitive: false,
      provenance: "sync",
      externalKey: `${conceptId}:${term.id}`,
      reviewStatus: "draft",
    };
  }

  async listTerms() {
    const concepts = await this.listConcepts();
    return concepts.flatMap(({ conceptId, terms }) => {
      const sourceTerm =
        terms.find((term) => term.languageId === this.input.glossary.sourceLocale)?.text ?? "";
      return terms.map((term) =>
        this.toLegacyTermRecord(
          term,
          String(conceptId),
          term.languageId === this.input.glossary.sourceLocale ? "" : sourceTerm,
        ),
      );
    });
  }

  async createGlossaryTerm(input: GlossaryTermCreateInput) {
    const created = await this.createConcept({
      primaryTerm: input.sourceTerm,
      sourceLocale: this.input.glossary.sourceLocale,
      terms: [
        {
          languageId: this.input.glossary.sourceLocale,
          text: input.sourceTerm,
          status: "preferred",
        },
        {
          languageId: this.input.glossary.targetLocale ?? "",
          text: input.targetTerm,
          status: "draft",
          description: input.description,
          partOfSpeech: input.partOfSpeech,
          url: input.url,
          lemma: input.lemma ?? undefined,
        },
      ].filter((term) => term.languageId),
    });
    const target = created?.terms.find(
      (term) => term.languageId !== this.input.glossary.sourceLocale,
    );
    return target
      ? this.toLegacyTermRecord(target, String(created?.conceptId), input.sourceTerm)
      : null;
  }

  async createGlossaryTerms(inputs: GlossaryTermCreateInput[]) {
    const created: GlossaryTermRecord[] = [];
    for (const input of inputs) {
      const term = await this.createGlossaryTerm(input);
      if (term) created.push(term);
    }
    return { created, skipped: inputs.length - created.length };
  }

  async updateGlossaryTerm(termId: string, input: GlossaryTermUpdateInput) {
    const concepts = await this.listConcepts();
    const match = concepts.find(({ terms }) => terms.some((term) => String(term.id) === termId));
    const existing = match?.terms.find((term) => String(term.id) === termId);
    if (!match || !existing) return null;
    const sourceTerm =
      match.terms.find((term) => term.languageId === this.input.glossary.sourceLocale)?.text ?? "";
    const updated = await this.updateTerm(String(match.conceptId), termId, {
      languageId: existing.languageId,
      text: input.targetTerm ?? existing.text,
      description: input.description ?? existing.description ?? "",
      partOfSpeech: input.partOfSpeech ?? existing.partOfSpeech ?? "",
      status: existing.status ?? "draft",
      note: existing.note ?? "",
    });
    return updated && "languageId" in updated
      ? this.toLegacyTermRecord(updated, String(match.conceptId), sourceTerm)
      : null;
  }

  async deleteGlossaryTerm(termId: string) {
    const concepts = await this.listConcepts();
    const match = concepts.find(({ terms }) => terms.some((term) => String(term.id) === termId));
    if (!match) return false;
    return this.deleteTerm(String(match.conceptId), termId);
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

  async createTerm(conceptId: string, term: NativeGlossaryTermInput) {
    const context = await this.context();
    return crowdinTmsProvider.createLiveGlossaryTerm(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
      normalizeCrowdinTerm(term),
    );
  }

  async updateTerm(conceptId: string, termId: string, term: NativeGlossaryTermInput) {
    const context = await this.context();
    return crowdinTmsProvider.updateLiveGlossaryTerm(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
      parseId(termId, "term_id"),
      normalizeCrowdinTerm(term),
    );
  }

  async deleteTerm(conceptId: string, termId: string) {
    const context = await this.context();
    return crowdinTmsProvider.deleteLiveGlossaryTerm(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
      parseId(termId, "term_id"),
    );
  }
}
