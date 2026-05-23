import { and, eq, notInArray, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export type MemorySyncState = (typeof schema.glossarySyncStateEnum.enumValues)[number];

const defaultMemorySyncState: MemorySyncState = "synced";

export type ExternalTmsMemoryMetadata = {
  organizationId: string;
  providerCredentialId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  externalMemoryId: string;
  name: string;
  description?: string;
  sourceLocale: string;
  localeCoverage?: string[];
  segmentCount?: number | null;
  syncState?: MemorySyncState;
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
      localeCoverage: input.localeCoverage ?? [input.sourceLocale],
      segmentCount: input.segmentCount ?? null,
      syncState: input.syncState ?? defaultMemorySyncState,
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
        localeCoverage: input.localeCoverage ?? [input.sourceLocale],
        segmentCount: input.segmentCount ?? null,
        syncState: input.syncState ?? defaultMemorySyncState,
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

const memoryEntryBatchSize = 200;

export async function upsertOrganizationExternalTmsMemoryEntries(
  entries: ExternalTmsMemoryEntryMetadata[],
) {
  if (entries.length === 0) {
    return;
  }

  const now = new Date();

  for (let index = 0; index < entries.length; index += memoryEntryBatchSize) {
    const chunk = entries.slice(index, index + memoryEntryBatchSize);
    const values = chunk.map((entry) => ({
      memoryId: entry.memoryId,
      sourceLocale: entry.sourceLocale,
      targetLocale: entry.targetLocale,
      sourceText: entry.sourceText,
      normalizedSourceText: normalizeTranslationMemorySourceText(entry.sourceText),
      targetText: entry.targetText,
      matchScore: entry.matchScore ?? 100,
      provenance: "sync" as const,
      externalKey: entry.externalKey,
      reviewStatus: "approved" as const,
      metadata: entry.metadata ?? {},
    }));

    await db
      .insert(schema.memoryEntries)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.memoryEntries.memoryId, schema.memoryEntries.externalKey],
        set: {
          sourceLocale: sql`excluded.source_locale`,
          targetLocale: sql`excluded.target_locale`,
          sourceText: sql`excluded.source_text`,
          normalizedSourceText: sql`excluded.normalized_source_text`,
          targetText: sql`excluded.target_text`,
          matchScore: sql`excluded.match_score`,
          provenance: sql`excluded.provenance`,
          reviewStatus: sql`excluded.review_status`,
          metadata: sql`excluded.metadata`,
          updatedAt: now,
        },
      });
  }
}

export async function upsertOrganizationExternalTmsMemoryEntry(
  input: ExternalTmsMemoryEntryMetadata,
) {
  await upsertOrganizationExternalTmsMemoryEntries([input]);
}

export async function pruneOrganizationExternalTmsMemoryEntries(input: {
  memoryId: string;
  externalKeys: string[];
}) {
  const uniqueExternalKeys = [...new Set(input.externalKeys)];

  if (uniqueExternalKeys.length === 0) {
    await db.delete(schema.memoryEntries).where(eq(schema.memoryEntries.memoryId, input.memoryId));
    return;
  }

  await db
    .delete(schema.memoryEntries)
    .where(
      and(
        eq(schema.memoryEntries.memoryId, input.memoryId),
        notInArray(schema.memoryEntries.externalKey, uniqueExternalKeys),
      ),
    );
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
