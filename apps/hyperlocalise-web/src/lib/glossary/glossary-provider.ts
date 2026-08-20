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

import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import type { Glossary as GlossaryRecord } from "@/lib/database/types";
import { resolveExternalTmsSecretMaterialForActor } from "@/lib/providers/shared/tms-provider-content";
import {
  crowdinTmsProvider,
  type CrowdinGlossaryConcept,
  type CrowdinGlossaryTermInput,
} from "@/lib/providers/adapters/crowdin/crowdin-provider";

export type GlossaryProviderContext = {
  auth: ApiAuthContext;
  glossary: GlossaryRecord;
  actorUserId?: string | null;
  signal?: AbortSignal;
};

export abstract class Glossary {
  abstract readonly kind: "native" | "crowdin";
  abstract get(): Promise<unknown>;
  abstract update(payload: { name?: string; description?: string }): Promise<unknown>;
  abstract delete(): Promise<unknown>;
}

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
  ): CrowdinGlossaryConcept {
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

  async createConcept(input: CrowdinGlossaryConcept) {
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

  async updateConcept(conceptId: string, input: CrowdinGlossaryConcept) {
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

  async createTerm(conceptId: string, input: CrowdinGlossaryTermInput) {
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
    return term ? this.getConcept(conceptId) : null;
  }

  async updateTerm(conceptId: string, termId: string, input: CrowdinGlossaryTermInput) {
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
    return term ? this.getConcept(conceptId) : null;
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
    return crowdinTmsProvider.fetchLiveGlossary(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
    );
  }

  async update(payload: { name?: string; description?: string }) {
    const context = await this.context();
    const patches = Object.entries(payload).map(([key, value]) => ({
      op: "replace" as const,
      path: `/${key}`,
      value,
    }));
    return crowdinTmsProvider.updateLiveGlossary(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      patches,
    );
  }

  async delete() {
    const context = await this.context();
    return crowdinTmsProvider.deleteLiveGlossary(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
    );
  }

  async listConcepts() {
    const context = await this.context();
    return crowdinTmsProvider.listLiveGlossaryConcepts(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
    );
  }

  async getConcept(conceptId: string) {
    const context = await this.context();
    return crowdinTmsProvider.getLiveGlossaryConcept(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
    );
  }

  async createConcept(concept: CrowdinGlossaryConcept) {
    const context = await this.context();
    return crowdinTmsProvider.createLiveGlossaryConcept(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      concept,
    );
  }

  async updateConcept(conceptId: string, concept: CrowdinGlossaryConcept) {
    const context = await this.context();
    return crowdinTmsProvider.updateLiveGlossaryConcept(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
      concept,
    );
  }

  async deleteConcept(conceptId: string) {
    const context = await this.context();
    return crowdinTmsProvider.deleteLiveGlossaryConcept(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
    );
  }

  async createTerm(conceptId: string, term: CrowdinGlossaryTermInput) {
    const context = await this.context();
    return crowdinTmsProvider.createLiveGlossaryTerm(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
      term,
    );
  }

  async updateTerm(conceptId: string, termId: string, term: CrowdinGlossaryTermInput) {
    const context = await this.context();
    return crowdinTmsProvider.updateLiveGlossaryTerm(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
      parseId(termId, "term_id"),
      term,
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

export abstract class GlossaryFactory {
  constructor(protected readonly input: GlossaryProviderContext) {}

  abstract createGlossary(): Glossary;
}

class NativeGlossaryFactory extends GlossaryFactory {
  createGlossary() {
    return new NativeGlossary(this.input);
  }
}

class CrowdinGlossaryFactory extends GlossaryFactory {
  createGlossary() {
    return new CrowdinGlossary(this.input);
  }
}

export function createGlossaryFactory(input: GlossaryProviderContext): GlossaryFactory {
  if (input.glossary.source === "native") return new NativeGlossaryFactory(input);
  if (input.glossary.externalProviderKind === "crowdin") {
    return new CrowdinGlossaryFactory(input);
  }
  throw new Error("glossary_provider_not_supported");
}

export function createGlossary(input: GlossaryProviderContext): Glossary {
  return createGlossaryFactory(input).createGlossary();
}

type CrowdinContext = {
  organizationId: string;
  externalProjectId: string;
  credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
  secretMaterial: string;
  actorUserId?: string | null;
  signal?: AbortSignal;
};

function parseId(value: string, label: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error(`invalid_crowdin_${label}`);
  }
  return id;
}

async function resolveCrowdinContext(input: GlossaryProviderContext): Promise<CrowdinContext> {
  const { glossary, auth } = input;
  if (glossary.externalProviderKind !== "crowdin" || !glossary.externalGlossaryId) {
    throw new Error("glossary_provider_not_supported");
  }

  const organizationId = auth.organization.localOrganizationId;
  let credentialId = glossary.externalProviderCredentialId;
  if (!credentialId && glossary.externalProjectId) {
    const [project] = await db
      .select({ credentialId: schema.projects.externalProviderCredentialId })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, organizationId),
          eq(schema.projects.source, "external_tms"),
          eq(schema.projects.externalProviderKind, "crowdin"),
          eq(schema.projects.externalProjectId, glossary.externalProjectId),
        ),
      )
      .limit(1);
    credentialId = project?.credentialId ?? null;
  }

  if (!credentialId || !glossary.externalProjectId) {
    throw new Error("provider_credential_not_found");
  }

  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.id, credentialId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, "crowdin"),
      ),
    )
    .limit(1);
  if (!credential) {
    throw new Error("provider_credential_not_found");
  }

  return {
    organizationId,
    externalProjectId: glossary.externalProjectId,
    credential,
    secretMaterial: await resolveExternalTmsSecretMaterialForActor({
      credential,
      organizationId,
      actorUserId: input.actorUserId,
    }),
    actorUserId: input.actorUserId,
    signal: input.signal,
  };
}

function toCrowdinContext(input: CrowdinContext) {
  return {
    organizationId: input.organizationId,
    projectId: input.externalProjectId,
    externalProjectId: input.externalProjectId,
    credential: input.credential,
    project: { externalProjectId: input.externalProjectId } as never,
    secretMaterial: input.secretMaterial,
    signal: input.signal,
  };
}

export function crowdinConceptId(conceptId: number): string {
  return String(conceptId);
}

export function crowdinTermId(termId: number): string {
  return String(termId);
}

export async function getGlossaryProvider(input: GlossaryProviderContext): Promise<Glossary> {
  const glossary = createGlossary(input);
  if (glossary instanceof CrowdinGlossary) await glossary.validate();
  return glossary;
}

async function getCrowdinGlossaryProduct(input: GlossaryProviderContext): Promise<CrowdinGlossary> {
  const glossary = createGlossary(input);
  if (!(glossary instanceof CrowdinGlossary)) {
    throw new Error("glossary_provider_not_supported");
  }
  return glossary;
}

export async function getCrowdinGlossary(input: GlossaryProviderContext) {
  const glossary = await getCrowdinGlossaryProduct(input);
  return glossary.get();
}

export async function updateCrowdinGlossary(
  input: GlossaryProviderContext,
  payload: { name?: string; description?: string },
) {
  const glossary = await getCrowdinGlossaryProduct(input);
  return glossary.update(payload);
}

export async function deleteCrowdinGlossary(input: GlossaryProviderContext) {
  const glossary = await getCrowdinGlossaryProduct(input);
  await glossary.delete();
}

export async function listCrowdinConcepts(input: GlossaryProviderContext) {
  const glossary = await getCrowdinGlossaryProduct(input);
  return glossary.listConcepts();
}

export async function getCrowdinConcept(input: GlossaryProviderContext, conceptId: string) {
  const glossary = await getCrowdinGlossaryProduct(input);
  return glossary.getConcept(conceptId);
}

export async function createCrowdinConcept(
  input: GlossaryProviderContext,
  concept: CrowdinGlossaryConcept,
) {
  const glossary = await getCrowdinGlossaryProduct(input);
  return glossary.createConcept(concept);
}

export async function updateCrowdinConcept(
  input: GlossaryProviderContext,
  conceptId: string,
  concept: CrowdinGlossaryConcept,
) {
  const glossary = await getCrowdinGlossaryProduct(input);
  return glossary.updateConcept(conceptId, concept);
}

export async function deleteCrowdinConcept(input: GlossaryProviderContext, conceptId: string) {
  const glossary = await getCrowdinGlossaryProduct(input);
  return glossary.deleteConcept(conceptId);
}

export async function createCrowdinTerm(
  input: GlossaryProviderContext,
  conceptId: string,
  term: CrowdinGlossaryTermInput,
) {
  const glossary = await getCrowdinGlossaryProduct(input);
  return glossary.createTerm(conceptId, term);
}

export async function updateCrowdinTerm(
  input: GlossaryProviderContext,
  conceptId: string,
  termId: string,
  term: CrowdinGlossaryTermInput,
) {
  const glossary = await getCrowdinGlossaryProduct(input);
  return glossary.updateTerm(conceptId, termId, term);
}

export async function deleteCrowdinTerm(
  input: GlossaryProviderContext,
  conceptId: string,
  termId: string,
) {
  const glossary = await getCrowdinGlossaryProduct(input);
  return glossary.deleteTerm(conceptId, termId);
}
