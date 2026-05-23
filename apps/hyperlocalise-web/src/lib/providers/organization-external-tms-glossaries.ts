import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import { normalizeProviderGlossaryTermFlags } from "./normalize-provider-glossary-term";
import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export type ExternalTmsTerminologyResourceType =
  (typeof schema.externalTmsTerminologyResourceTypeEnum.enumValues)[number];

export type ExternalTmsGlossaryMetadata = {
  organizationId: string;
  providerCredentialId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  externalResourceType: ExternalTmsTerminologyResourceType;
  externalGlossaryId: string;
  name: string;
  description?: string;
  sourceLocale: string;
  targetLocale: string;
  localeCoverage?: string[];
  termCount?: number | null;
  syncState?: string;
  termCapabilities?: Record<string, unknown>;
  externalUrl?: string | null;
  syncErrorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

export type ExternalTmsGlossaryTermMetadata = {
  glossaryId: string;
  externalKey: string;
  sourceTerm: string;
  targetTerm: string;
  description?: string;
  partOfSpeech?: string;
  caseSensitive?: boolean;
  status?: string | null;
  forbidden?: boolean | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

export async function upsertOrganizationExternalTmsGlossary(input: ExternalTmsGlossaryMetadata) {
  const now = new Date();
  const [glossary] = await db
    .insert(schema.glossaries)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      description: input.description ?? "",
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      status: "active",
      source: "external_tms",
      externalProviderCredentialId: input.providerCredentialId,
      externalProviderKind: input.providerKind,
      externalProjectId: input.externalProjectId,
      externalResourceType: input.externalResourceType,
      externalGlossaryId: input.externalGlossaryId,
      localeCoverage: input.localeCoverage ?? [input.sourceLocale, input.targetLocale],
      termCount: input.termCount ?? null,
      syncState: input.syncState ?? "synced",
      termCapabilities: input.termCapabilities ?? {},
      externalUrl: input.externalUrl ?? null,
      lastSyncedAt: input.syncErrorMessage ? undefined : now,
      lastSyncErrorAt: input.syncErrorMessage ? now : null,
      lastSyncErrorMessage: input.syncErrorMessage ?? null,
      providerMetadata: input.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [
        schema.glossaries.organizationId,
        schema.glossaries.externalProviderKind,
        schema.glossaries.externalProjectId,
        schema.glossaries.externalResourceType,
        schema.glossaries.externalGlossaryId,
        schema.glossaries.sourceLocale,
        schema.glossaries.targetLocale,
      ],
      set: {
        name: input.name,
        description: input.description ?? "",
        source: "external_tms",
        externalProviderCredentialId: input.providerCredentialId,
        localeCoverage: input.localeCoverage ?? [input.sourceLocale, input.targetLocale],
        termCount: input.termCount ?? null,
        syncState: input.syncState ?? "synced",
        termCapabilities: input.termCapabilities ?? {},
        externalUrl: input.externalUrl ?? null,
        lastSyncedAt: input.syncErrorMessage ? undefined : now,
        lastSyncErrorAt: input.syncErrorMessage ? now : null,
        lastSyncErrorMessage: input.syncErrorMessage ?? null,
        providerMetadata: input.metadata ?? {},
        updatedAt: now,
      },
    })
    .returning();

  if (!glossary) {
    throw new Error("Failed to upsert external TMS glossary");
  }

  return glossary;
}

export async function upsertOrganizationExternalTmsGlossaryTerm(
  input: ExternalTmsGlossaryTermMetadata,
) {
  const now = new Date();
  const { forbidden } = normalizeProviderGlossaryTermFlags({
    status: input.status,
    forbidden: input.forbidden,
  });
  const metadata = {
    ...input.metadata,
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.status ? { providerStatus: input.status } : {}),
  };

  const [term] = await db
    .insert(schema.glossaryTerms)
    .values({
      glossaryId: input.glossaryId,
      sourceTerm: input.sourceTerm,
      targetTerm: input.targetTerm,
      description: input.description ?? "",
      partOfSpeech: input.partOfSpeech ?? "",
      caseSensitive: input.caseSensitive ?? false,
      forbidden,
      externalKey: input.externalKey,
      provenance: "sync",
      reviewStatus: "approved",
      metadata,
    })
    .onConflictDoUpdate({
      target: [schema.glossaryTerms.glossaryId, schema.glossaryTerms.externalKey],
      set: {
        sourceTerm: input.sourceTerm,
        targetTerm: input.targetTerm,
        description: input.description ?? "",
        partOfSpeech: input.partOfSpeech ?? "",
        caseSensitive: input.caseSensitive ?? false,
        forbidden,
        provenance: "sync",
        reviewStatus: "approved",
        metadata,
        updatedAt: now,
      },
    })
    .returning();

  if (!term) {
    throw new Error("Failed to upsert external TMS glossary term");
  }

  return term;
}

export async function listOrganizationExternalTmsGlossaries(input: {
  organizationId: string;
  providerKind?: ExternalTmsProviderKind;
  externalProjectId?: string;
}) {
  const conditions = [
    eq(schema.glossaries.organizationId, input.organizationId),
    eq(schema.glossaries.source, "external_tms"),
  ];

  if (input.providerKind) {
    conditions.push(eq(schema.glossaries.externalProviderKind, input.providerKind));
  }

  if (input.externalProjectId) {
    conditions.push(eq(schema.glossaries.externalProjectId, input.externalProjectId));
  }

  return db
    .select()
    .from(schema.glossaries)
    .where(and(...conditions));
}
