import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import {
  buildExternalTmsMemorySegmentCapabilities,
  type ExternalTmsMemoryCapabilityMode,
} from "./build-external-tms-memory-segment-capabilities";
import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

export type MemorySyncState = (typeof schema.glossarySyncStateEnum.enumValues)[number];

export type { ExternalTmsMemoryCapabilityMode };

const defaultMemorySyncState: MemorySyncState = "synced";

export type ExternalTmsMemoryMetadata = {
  organizationId: string;
  providerCredentialId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  externalMemoryId: string;
  name: string;
  description?: string;
  localeCoverage?: string[];
  segmentCount?: number | null;
  syncState?: MemorySyncState;
  capabilityMode: ExternalTmsMemoryCapabilityMode;
  segmentCapabilities?: Record<string, unknown>;
  externalUrl?: string | null;
  syncErrorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

export type ExternalTmsMemoryEntryMetadata = {
  memoryId: string;
  externalKey: string;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  targetText: string;
  matchScore?: number;
  metadata?: Record<string, unknown>;
};

export async function upsertOrganizationExternalTmsMemory(input: ExternalTmsMemoryMetadata) {
  const now = new Date();
  const segmentCapabilities =
    input.segmentCapabilities ?? buildExternalTmsMemorySegmentCapabilities(input.capabilityMode);

  const [memory] = await db
    .insert(schema.memories)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      description: input.description ?? "",
      status: "active",
      source: "external_tms",
      externalProviderCredentialId: input.providerCredentialId,
      externalProviderKind: input.providerKind,
      externalProjectId: input.externalProjectId,
      externalMemoryId: input.externalMemoryId,
      localeCoverage: input.localeCoverage ?? [],
      segmentCount: input.segmentCount ?? null,
      syncState: input.syncState ?? defaultMemorySyncState,
      capabilityMode: input.capabilityMode,
      segmentCapabilities,
      externalUrl: input.externalUrl ?? null,
      lastSyncedAt: input.syncErrorMessage ? undefined : now,
      lastSyncErrorAt: input.syncErrorMessage ? now : null,
      lastSyncErrorMessage: input.syncErrorMessage ?? null,
      providerMetadata: input.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [
        schema.memories.organizationId,
        schema.memories.externalProviderKind,
        schema.memories.externalProjectId,
        schema.memories.externalMemoryId,
      ],
      set: {
        name: input.name,
        description: input.description ?? "",
        source: "external_tms",
        externalProviderCredentialId: input.providerCredentialId,
        localeCoverage: input.localeCoverage ?? [],
        segmentCount: input.segmentCount ?? null,
        syncState: input.syncState ?? defaultMemorySyncState,
        capabilityMode: input.capabilityMode,
        segmentCapabilities,
        externalUrl: input.externalUrl ?? null,
        lastSyncedAt: input.syncErrorMessage ? undefined : now,
        lastSyncErrorAt: input.syncErrorMessage ? now : null,
        lastSyncErrorMessage: input.syncErrorMessage ?? null,
        providerMetadata: input.metadata ?? {},
        updatedAt: now,
      },
    })
    .returning();

  if (!memory) {
    throw new Error("Failed to upsert external TMS translation memory");
  }

  return memory;
}

export async function upsertOrganizationExternalTmsMemoryEntry(
  input: ExternalTmsMemoryEntryMetadata,
) {
  const now = new Date();
  const normalizedSourceText = normalizeTranslationMemorySourceText(input.sourceText);

  const [entry] = await db
    .insert(schema.memoryEntries)
    .values({
      memoryId: input.memoryId,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      sourceText: input.sourceText,
      normalizedSourceText,
      targetText: input.targetText,
      matchScore: input.matchScore ?? 100,
      provenance: "sync",
      externalKey: input.externalKey,
      reviewStatus: "approved",
      metadata: input.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [schema.memoryEntries.memoryId, schema.memoryEntries.externalKey],
      set: {
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        sourceText: input.sourceText,
        normalizedSourceText,
        targetText: input.targetText,
        matchScore: input.matchScore ?? 100,
        provenance: "sync",
        reviewStatus: "approved",
        metadata: input.metadata ?? {},
        updatedAt: now,
      },
    })
    .returning();

  if (!entry) {
    throw new Error("Failed to upsert external TMS translation memory entry");
  }

  return entry;
}

export async function listOrganizationExternalTmsMemories(input: {
  organizationId: string;
  providerKind?: ExternalTmsProviderKind;
  externalProjectId?: string;
}) {
  const conditions = [
    eq(schema.memories.organizationId, input.organizationId),
    eq(schema.memories.source, "external_tms"),
  ];

  if (input.providerKind) {
    conditions.push(eq(schema.memories.externalProviderKind, input.providerKind));
  }

  if (input.externalProjectId) {
    conditions.push(eq(schema.memories.externalProjectId, input.externalProjectId));
  }

  return db
    .select()
    .from(schema.memories)
    .where(and(...conditions));
}
