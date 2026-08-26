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
  type CrowdinGlossaryTermInput,
} from "@/lib/providers/adapters/crowdin/crowdin-provider";
import type {
  CrowdinGlossary as CrowdinGlossaryRecord,
  CrowdinGlossaryConcordanceSearchResult,
} from "@/lib/providers/adapters/crowdin/crowdin-api";
import { CrowdinApiClient } from "@/lib/providers/adapters/crowdin/crowdin-api";
import { mapCrowdinGlossaryConcordanceSearchResult } from "@/lib/providers/adapters/crowdin/crowdin-glossary-concordance";
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { NormalizedGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
import { sanitizeExternalUrl } from "@/lib/security/safe-external-url";

import {
  Glossary,
  normalizeGlossaryGender,
  normalizeGlossaryPartOfSpeech,
  normalizeGlossaryTermStatus,
  normalizeGlossaryTermType,
  selectGlossaryPrimaryTerm,
  type GlossaryConcordanceContext,
  type GlossaryConcordanceQuery,
  type GlossaryConceptImportEntry,
  type GlossaryConcept,
  type GlossaryConceptTerm,
  type GlossaryConceptInput,
  type GlossaryProjectRecord,
  type GlossaryTermCreateInput,
  type GlossaryTermRecord,
  type GlossaryTermUpdateInput,
  type NativeGlossary,
  type NativeGlossaryTermInput,
} from "./glossary";
import { parseLiveProviderGlossaryId } from "@/lib/providers/jobs/tms-provider-resource-id";
import {
  toCrowdinGlossaryLanguageId,
  toNativeGlossaryLocale,
} from "@/lib/providers/adapters/crowdin/crowdin-glossary-language";

import type { Glossary as GlossaryRecord } from "@/lib/database/types";

import { parseId, resolveCrowdinContext, toCrowdinContext } from "./glossary-provider";
import type { GlossaryProviderContext } from "./glossary-provider";

function supportsCrowdinConcordanceSearch(glossary: GlossaryProviderContext["glossary"]): boolean {
  const termCapabilities = glossary.termCapabilities as Record<string, unknown>;
  return !(termCapabilities.referenceOnly === true || termCapabilities.search === false);
}

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

export function toCrowdinConceptInput(concept: GlossaryConcept): CrowdinGlossaryConcept {
  const primaryTerm = selectGlossaryPrimaryTerm(concept.terms, concept.sourceLocale);
  const hasPreferredSourceTerm = concept.terms.some(
    (term) =>
      term.locale === concept.sourceLocale &&
      term.status?.trim().toLowerCase().replaceAll(" ", "_") === "preferred",
  );
  const terms = concept.terms.map((term) => ({
    id: term.id,
    languageId: toCrowdinGlossaryLanguageId(term.locale),
    text: term === primaryTerm && concept.primaryTerm ? concept.primaryTerm : term.text,
    description: term.description,
    partOfSpeech: normalizeGlossaryPartOfSpeech(term.partOfSpeech, { required: false }),
    status:
      term === primaryTerm && term.locale === concept.sourceLocale && !hasPreferredSourceTerm
        ? "preferred"
        : term !== primaryTerm &&
            term.locale === concept.sourceLocale &&
            crowdinStatus(term.status) === "preferred"
          ? "admitted"
          : crowdinStatus(term.status),
    type: term.type,
    gender: term.gender,
    note: term.note,
    url: term.url || undefined,
    lemma: term.lemma,
  }));

  if (!concept.terms.some((term) => term.locale === concept.sourceLocale) && concept.primaryTerm) {
    const sourcePartOfSpeech = terms.find((term) => term.partOfSpeech)?.partOfSpeech;
    terms.push({
      id: undefined,
      languageId: toCrowdinGlossaryLanguageId(concept.sourceLocale),
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
    conceptId: concept.conceptId,
    primaryTerm: concept.primaryTerm,
    sourceLocale: concept.sourceLocale,
    subject: concept.subject,
    definition: concept.definition,
    translatable: concept.translatable,
    note: concept.note,
    url: concept.url,
    figure: concept.figure,
    externalKey: concept.externalKey,
    externalUserId: concept.externalUserId,
    languageDetails: concept.languageDetails?.map((detail) => ({
      languageId: toCrowdinGlossaryLanguageId(detail.locale),
      userId: detail.userId,
      definition: detail.definition,
      note: detail.note,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
    })),
    externalCreatedAt: concept.externalCreatedAt,
    externalUpdatedAt: concept.externalUpdatedAt,
    terms,
  };
}

function normalizeCrowdinTerm(term: NativeGlossaryTermInput): CrowdinGlossaryTermInput {
  return {
    languageId: toCrowdinGlossaryLanguageId(term.locale),
    text: term.text,
    description: term.description,
    status: term.status,
    type: term.type,
    gender: term.gender,
    note: term.note,
    url: term.url,
    lemma: term.lemma,
    partOfSpeech: normalizeGlossaryPartOfSpeech(term.partOfSpeech, { required: false }),
  };
}

function toGlossaryTerm(
  term: CrowdinGlossaryTermInput & { id?: number | string; conceptId?: number },
  preferredLocales: readonly string[],
): GlossaryConceptTerm {
  return {
    id: term.id,
    conceptId: term.conceptId,
    locale: toNativeGlossaryLocale(term.languageId, preferredLocales),
    text: term.text,
    description: term.description,
    partOfSpeech: term.partOfSpeech,
    status: normalizeGlossaryTermStatus(term.status),
    type: normalizeGlossaryTermType(term.type),
    gender: normalizeGlossaryGender(term.gender),
    note: term.note,
    url: term.url,
    lemma: term.lemma,
  };
}

export function toGlossaryConcept(
  concept: CrowdinGlossaryConcept,
  preferredLocales: readonly string[] = [],
): GlossaryConcept {
  return {
    conceptId: concept.conceptId,
    primaryTerm: concept.primaryTerm,
    sourceLocale: concept.sourceLocale,
    subject: concept.subject,
    definition: concept.definition,
    translatable: concept.translatable,
    note: concept.note,
    url: concept.url,
    figure: concept.figure,
    externalKey: concept.externalKey,
    externalUserId: concept.externalUserId,
    languageDetails: concept.languageDetails?.map((detail) => ({
      locale: toNativeGlossaryLocale(detail.languageId, preferredLocales),
      userId: detail.userId,
      definition: detail.definition,
      note: detail.note,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
    })),
    externalCreatedAt: concept.externalCreatedAt,
    externalUpdatedAt: concept.externalUpdatedAt,
    terms: concept.terms.map((term) => ({
      id: term.id,
      locale: toNativeGlossaryLocale(term.languageId, preferredLocales),
      text: term.text,
      description: term.description,
      partOfSpeech: term.partOfSpeech,
      note: term.note,
      url: term.url,
      lemma: term.lemma,
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
  const preferredLocales = [
    nativeGlossary.sourceLocale,
    nativeGlossary.targetLocale,
    ...nativeGlossary.localeCoverage,
  ].filter((locale): locale is string => Boolean(locale));
  const sourceLocale = toNativeGlossaryLocale(glossary.languageId, preferredLocales);
  const localeCoverage = glossary.languageIds.map((languageId) =>
    toNativeGlossaryLocale(languageId, preferredLocales),
  );
  return {
    ...nativeGlossary,
    name: glossary.name,
    description: glossary.description ?? "",
    sourceLocale,
    targetLocale: localeCoverage.find((locale) => locale !== sourceLocale) ?? null,
    localeCoverage,
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

  get id() {
    return this.input.glossary.id;
  }

  async queryProjectCount() {
    return (await this.listProjects()).length;
  }

  private async context() {
    return resolveCrowdinContext(this.input);
  }

  private preferredLocales() {
    return [
      this.input.glossary.sourceLocale,
      this.input.glossary.targetLocale,
      ...this.input.glossary.localeCoverage,
    ].filter((locale): locale is string => Boolean(locale));
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

  async listProjects(): Promise<GlossaryProjectRecord[]> {
    const context = await this.context();
    const projects = await crowdinTmsProvider.listLiveGlossaryProjects(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
    );

    return projects.map((project) => ({
      projectId: String(project.id),
      projectName: project.name,
      priority: 0,
      sourceLocale: project.sourceLanguageId,
      targetLocales: project.targetLanguageIds,
      externalUrl: sanitizeExternalUrl(project.webUrl),
    }));
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
    const externalGlossaryId = this.input.glossary.externalGlossaryId!;
    await crowdinTmsProvider.deleteLiveGlossary(
      toCrowdinContext(context),
      parseId(externalGlossaryId, "glossary_id"),
    );

    // Prefer matching the Crowdin glossary id so live ephemeral rows
    // (`crowdin:glossary:{n}`) still clean up any mirrored local mapping.
    const deleted = await db
      .delete(schema.glossaries)
      .where(
        and(
          eq(schema.glossaries.organizationId, this.input.auth.organization.localOrganizationId),
          eq(schema.glossaries.externalProviderKind, "crowdin"),
          eq(schema.glossaries.externalGlossaryId, externalGlossaryId),
        ),
      )
      .returning({ id: schema.glossaries.id });

    // Live Crowdin glossaries may have no local mapping. Remote delete is success.
    if (parseLiveProviderGlossaryId(this.input.glossary.id)?.providerKind === "crowdin") {
      return true;
    }

    return deleted.length > 0;
  }

  async listConcepts() {
    const context = await this.context();
    const concepts = await crowdinTmsProvider.listLiveGlossaryConcepts(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
    );
    return concepts.map((concept) => toGlossaryConcept(concept, this.preferredLocales()));
  }

  async getConcept(conceptId: string) {
    const context = await this.context();
    const concept = await crowdinTmsProvider.getLiveGlossaryConcept(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
    );
    return concept ? toGlossaryConcept(concept, this.preferredLocales()) : null;
  }

  async createConcept(input: GlossaryConceptInput) {
    const context = await this.context();
    const concept = toGlossaryConceptInput(input, this.input.glossary.sourceLocale);
    const created = await crowdinTmsProvider.createLiveGlossaryConcept(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      toCrowdinConceptInput(concept),
    );
    return created ? toGlossaryConcept(created, this.preferredLocales()) : null;
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
    return updated ? toGlossaryConcept(updated, this.preferredLocales()) : null;
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
          locale: entry.locale,
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
      targetLocale: term.locale,
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
        terms.find((term) => term.locale === this.input.glossary.sourceLocale)?.text ?? "";
      return terms.map((term) =>
        this.toLegacyTermRecord(
          term,
          String(conceptId),
          term.locale === this.input.glossary.sourceLocale ? "" : sourceTerm,
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
          locale: this.input.glossary.sourceLocale,
          text: input.sourceTerm,
          status: "preferred",
        },
        {
          locale: this.input.glossary.targetLocale ?? "",
          text: input.targetTerm,
          status: "draft",
          description: input.description,
          partOfSpeech: input.partOfSpeech,
          url: input.url,
          lemma: input.lemma ?? undefined,
        },
      ].filter((term) => term.locale),
    });
    const target = created?.terms.find((term) => term.locale !== this.input.glossary.sourceLocale);
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
      match.terms.find((term) => term.locale === this.input.glossary.sourceLocale)?.text ?? "";
    const updated = await this.updateTerm(String(match.conceptId), termId, {
      locale: existing.locale,
      text: input.targetTerm ?? existing.text,
      description: input.description ?? existing.description ?? "",
      partOfSpeech: input.partOfSpeech ?? existing.partOfSpeech ?? "",
      status: existing.status ?? "draft",
      note: existing.note ?? "",
    });
    return updated && "locale" in updated
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
    const created = await crowdinTmsProvider.createLiveGlossaryTerm(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
      normalizeCrowdinTerm(term),
    );
    return created ? toGlossaryTerm(created, this.preferredLocales()) : null;
  }

  async updateTerm(conceptId: string, termId: string, term: NativeGlossaryTermInput) {
    const context = await this.context();
    const updated = await crowdinTmsProvider.updateLiveGlossaryTerm(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
      parseId(termId, "term_id"),
      normalizeCrowdinTerm(term),
    );
    return updated ? toGlossaryTerm(updated, this.preferredLocales()) : null;
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

  async searchConcordance(
    query: GlossaryConcordanceQuery,
    _ctx: GlossaryConcordanceContext,
  ): Promise<NormalizedGlossaryMatch[]> {
    if (!supportsCrowdinConcordanceSearch(this.input.glossary)) {
      return [];
    }

    if (!this.input.glossary.externalGlossaryId) {
      return [];
    }

    return searchAttachedCrowdinGlossaryConcordance({
      providerContext: this.input,
      attachedGlossaries: [this.input.glossary],
      query,
    });
  }
}

export async function searchAttachedCrowdinGlossaryConcordance(input: {
  providerContext: GlossaryProviderContext;
  attachedGlossaries: GlossaryRecord[];
  query: GlossaryConcordanceQuery;
}): Promise<NormalizedGlossaryMatch[]> {
  const searchableGlossaries = input.attachedGlossaries.filter(
    (glossary) => supportsCrowdinConcordanceSearch(glossary) && glossary.externalGlossaryId,
  );
  if (searchableGlossaries.length === 0) {
    return [];
  }

  const glossariesByCrowdinId = new Map<number, GlossaryRecord>();
  for (const glossary of searchableGlossaries) {
    glossariesByCrowdinId.set(parseId(glossary.externalGlossaryId!, "glossary_id"), glossary);
  }

  const context = await resolveCrowdinContext(input.providerContext);
  const client = new CrowdinApiClient({
    token: context.secretMaterial,
    baseUrl: context.credential.baseUrl ?? undefined,
    signal: context.signal,
  });
  const projectId = Number(context.externalProjectId);
  if (Number.isNaN(projectId)) {
    return [];
  }

  const limit = input.query.limit ?? 20;
  const sourceLanguageId = toCrowdinGlossaryLanguageId(input.query.sourceLocale);
  const matches: NormalizedGlossaryMatch[] = [];

  for (const targetLocale of input.query.targetLocales) {
    const targetLanguageId = toCrowdinGlossaryLanguageId(targetLocale);
    let results: CrowdinGlossaryConcordanceSearchResult[];
    try {
      results = await client.glossaryConcordanceSearch(projectId, {
        sourceLanguageId,
        targetLanguageId,
        expressions: [input.query.sourceText],
      });
    } catch {
      continue;
    }

    for (const [index, result] of results.entries()) {
      const glossary = glossariesByCrowdinId.get(result.glossary.id);
      if (!glossary) {
        continue;
      }

      const match = mapCrowdinGlossaryConcordanceSearchResult({
        result,
        index,
        resourceId: glossary.id,
        glossaryName: glossary.name,
        sourceLocale: input.query.sourceLocale,
        targetLocale,
        stableTermIdGlossaryKey: glossary.id,
      });
      if (match) {
        matches.push(match);
      }
    }
  }

  return matches.toSorted((left, right) => right.rank - left.rank).slice(0, limit);
}
