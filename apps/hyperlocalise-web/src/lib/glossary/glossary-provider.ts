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
import { and, eq } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import type { Glossary as GlossaryRecord } from "@/lib/database/types";
import { resolveExternalTmsSecretMaterialForActor } from "@/lib/providers/shared/tms-provider-content";
import { CrowdinGlossary as CrowdinGlossaryProduct } from "./crowdin-glossary";
import { Glossary, type NativeGlossaryConcept, type NativeGlossaryTermInput } from "./glossary";
import { NativeGlossary as NativeGlossaryProduct } from "./native-glossary";

export type GlossaryProviderContext = {
  auth: ApiAuthContext;
  glossary: GlossaryRecord;
  actorUserId?: string | null;
  signal?: AbortSignal;
};

export { Glossary } from "./glossary";

export abstract class GlossaryFactory {
  constructor(protected readonly input: GlossaryProviderContext) {}

  abstract createGlossary(): Glossary;
}

class NativeGlossaryFactory extends GlossaryFactory {
  createGlossary() {
    return new NativeGlossaryProduct(this.input);
  }
}

class CrowdinGlossaryFactory extends GlossaryFactory {
  createGlossary() {
    return new CrowdinGlossaryProduct(this.input);
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

export function getGlossaryProduct(input: GlossaryProviderContext): Glossary | null {
  try {
    return createGlossary(input);
  } catch (error) {
    if (error instanceof Error && error.message === "glossary_provider_not_supported") {
      return null;
    }
    throw error;
  }
}

type CrowdinContext = {
  organizationId: string;
  externalProjectId: string;
  credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
  secretMaterial: string;
  actorUserId?: string | null;
  signal?: AbortSignal;
};

export function parseId(value: string, label: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error(`invalid_crowdin_${label}`);
  }
  return id;
}

export async function resolveCrowdinContext(
  input: GlossaryProviderContext,
): Promise<CrowdinContext> {
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

export function toCrowdinContext(input: CrowdinContext) {
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
  if (glossary instanceof CrowdinGlossaryProduct) await glossary.validate();
  return glossary;
}

async function getCrowdinGlossaryProduct(
  input: GlossaryProviderContext,
): Promise<CrowdinGlossaryProduct> {
  const glossary = createGlossary(input);
  if (!(glossary instanceof CrowdinGlossaryProduct)) {
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
  concept: NativeGlossaryConcept,
) {
  const glossary = await getCrowdinGlossaryProduct(input);
  return glossary.createConcept(concept);
}

export async function updateCrowdinConcept(
  input: GlossaryProviderContext,
  conceptId: string,
  concept: NativeGlossaryConcept,
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
  term: NativeGlossaryTermInput,
) {
  const glossary = await getCrowdinGlossaryProduct(input);
  return glossary.createTerm(conceptId, term);
}

export async function updateCrowdinTerm(
  input: GlossaryProviderContext,
  conceptId: string,
  termId: string,
  term: NativeGlossaryTermInput,
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
