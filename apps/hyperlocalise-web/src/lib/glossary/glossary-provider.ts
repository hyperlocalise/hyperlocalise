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
import type { Glossary } from "@/lib/database/types";
import { resolveExternalTmsSecretMaterialForActor } from "@/lib/providers/shared/tms-provider-content";
import {
  crowdinTmsProvider,
  type CrowdinGlossaryConcept,
  type CrowdinGlossaryTermInput,
} from "@/lib/providers/adapters/crowdin/crowdin-provider";

export type GlossaryProviderContext = {
  auth: ApiAuthContext;
  glossary: Glossary;
  actorUserId?: string | null;
  signal?: AbortSignal;
};

export type GlossaryProvider = {
  kind: "native" | "crowdin";
};

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

export async function getGlossaryProvider(
  input: GlossaryProviderContext,
): Promise<GlossaryProvider> {
  if (input.glossary.source === "native") return { kind: "native" };
  if (input.glossary.externalProviderKind === "crowdin") {
    await resolveCrowdinContext(input);
    return { kind: "crowdin" };
  }
  throw new Error("glossary_provider_not_supported");
}

export async function getCrowdinGlossary(input: GlossaryProviderContext) {
  const context = await resolveCrowdinContext(input);
  return crowdinTmsProvider.fetchLiveGlossary(
    toCrowdinContext(context),
    parseId(input.glossary.externalGlossaryId!, "glossary_id"),
  );
}

export async function updateCrowdinGlossary(
  input: GlossaryProviderContext,
  payload: { name?: string; description?: string },
) {
  const context = await resolveCrowdinContext(input);
  const patches = Object.entries(payload).map(([key, value]) => ({
    op: "replace" as const,
    path: `/${key}`,
    value,
  }));
  return crowdinTmsProvider.updateLiveGlossary(
    toCrowdinContext(context),
    parseId(input.glossary.externalGlossaryId!, "glossary_id"),
    patches,
  );
}

export async function deleteCrowdinGlossary(input: GlossaryProviderContext) {
  const context = await resolveCrowdinContext(input);
  await crowdinTmsProvider.deleteLiveGlossary(
    toCrowdinContext(context),
    parseId(input.glossary.externalGlossaryId!, "glossary_id"),
  );
}

export async function listCrowdinConcepts(input: GlossaryProviderContext) {
  const context = await resolveCrowdinContext(input);
  return crowdinTmsProvider.listLiveGlossaryConcepts(
    toCrowdinContext(context),
    parseId(input.glossary.externalGlossaryId!, "glossary_id"),
  );
}

export async function getCrowdinConcept(input: GlossaryProviderContext, conceptId: string) {
  const context = await resolveCrowdinContext(input);
  return crowdinTmsProvider.getLiveGlossaryConcept(
    toCrowdinContext(context),
    parseId(input.glossary.externalGlossaryId!, "glossary_id"),
    parseId(conceptId, "concept_id"),
  );
}

export async function createCrowdinConcept(
  input: GlossaryProviderContext,
  concept: CrowdinGlossaryConcept,
) {
  const context = await resolveCrowdinContext(input);
  return crowdinTmsProvider.createLiveGlossaryConcept(
    toCrowdinContext(context),
    parseId(input.glossary.externalGlossaryId!, "glossary_id"),
    concept,
  );
}

export async function updateCrowdinConcept(
  input: GlossaryProviderContext,
  conceptId: string,
  concept: CrowdinGlossaryConcept,
) {
  const context = await resolveCrowdinContext(input);
  return crowdinTmsProvider.updateLiveGlossaryConcept(
    toCrowdinContext(context),
    parseId(input.glossary.externalGlossaryId!, "glossary_id"),
    parseId(conceptId, "concept_id"),
    concept,
  );
}

export async function deleteCrowdinConcept(input: GlossaryProviderContext, conceptId: string) {
  const context = await resolveCrowdinContext(input);
  return crowdinTmsProvider.deleteLiveGlossaryConcept(
    toCrowdinContext(context),
    parseId(input.glossary.externalGlossaryId!, "glossary_id"),
    parseId(conceptId, "concept_id"),
  );
}

export async function createCrowdinTerm(
  input: GlossaryProviderContext,
  conceptId: string,
  term: CrowdinGlossaryTermInput,
) {
  const context = await resolveCrowdinContext(input);
  return crowdinTmsProvider.createLiveGlossaryTerm(
    toCrowdinContext(context),
    parseId(input.glossary.externalGlossaryId!, "glossary_id"),
    parseId(conceptId, "concept_id"),
    term,
  );
}

export async function updateCrowdinTerm(
  input: GlossaryProviderContext,
  conceptId: string,
  termId: string,
  term: CrowdinGlossaryTermInput,
) {
  const context = await resolveCrowdinContext(input);
  return crowdinTmsProvider.updateLiveGlossaryTerm(
    toCrowdinContext(context),
    parseId(input.glossary.externalGlossaryId!, "glossary_id"),
    parseId(conceptId, "concept_id"),
    parseId(termId, "term_id"),
    term,
  );
}

export async function deleteCrowdinTerm(
  input: GlossaryProviderContext,
  conceptId: string,
  termId: string,
) {
  const context = await resolveCrowdinContext(input);
  return crowdinTmsProvider.deleteLiveGlossaryTerm(
    toCrowdinContext(context),
    parseId(input.glossary.externalGlossaryId!, "glossary_id"),
    parseId(conceptId, "concept_id"),
    parseId(termId, "term_id"),
  );
}
