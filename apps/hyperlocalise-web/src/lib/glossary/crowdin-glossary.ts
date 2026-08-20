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
  type NativeGlossary,
  type NativeGlossaryConcept,
  type NativeGlossaryTermInput,
} from "./glossary";
import { parseId, resolveCrowdinContext, toCrowdinContext } from "./glossary-provider";
import type { GlossaryProviderContext } from "./glossary-provider";

export function toNativeGlossaryConcept(concept: CrowdinGlossaryConcept): NativeGlossaryConcept {
  return {
    ...concept,
    terms: concept.terms.map((term) => ({ ...term })),
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
    return concepts.map(toNativeGlossaryConcept);
  }

  async getConcept(conceptId: string) {
    const context = await this.context();
    const concept = await crowdinTmsProvider.getLiveGlossaryConcept(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
    );
    return concept ? toNativeGlossaryConcept(concept) : null;
  }

  async createConcept(concept: NativeGlossaryConcept) {
    const context = await this.context();
    const created = await crowdinTmsProvider.createLiveGlossaryConcept(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      concept,
    );
    return created ? toNativeGlossaryConcept(created) : null;
  }

  async updateConcept(conceptId: string, concept: NativeGlossaryConcept) {
    const context = await this.context();
    const updated = await crowdinTmsProvider.updateLiveGlossaryConcept(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
      concept,
    );
    return updated ? toNativeGlossaryConcept(updated) : null;
  }

  async deleteConcept(conceptId: string) {
    const context = await this.context();
    return crowdinTmsProvider.deleteLiveGlossaryConcept(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
    );
  }

  async createTerm(conceptId: string, term: NativeGlossaryTermInput) {
    const context = await this.context();
    return crowdinTmsProvider.createLiveGlossaryTerm(
      toCrowdinContext(context),
      parseId(this.input.glossary.externalGlossaryId!, "glossary_id"),
      parseId(conceptId, "concept_id"),
      term,
    );
  }

  async updateTerm(conceptId: string, termId: string, term: NativeGlossaryTermInput) {
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
