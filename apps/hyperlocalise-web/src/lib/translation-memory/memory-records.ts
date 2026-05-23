import type { Memory } from "@/lib/database/types";
import type { TranslationMemoryRecord } from "@/api/routes/translation-memory/translation-memory.schema";

export function toTranslationMemoryRecord(memory: Memory): TranslationMemoryRecord {
  return {
    id: memory.id,
    organizationId: memory.organizationId,
    createdByUserId: memory.createdByUserId,
    name: memory.name,
    description: memory.description,
    status: memory.status,
    source: memory.source,
    externalProviderKind: memory.externalProviderKind,
    externalProjectId: memory.externalProjectId,
    externalMemoryId: memory.externalMemoryId,
    localeCoverage: memory.localeCoverage,
    segmentCount: memory.segmentCount,
    syncState: memory.syncState,
    externalUrl: memory.externalUrl,
    lastSyncedAt: memory.lastSyncedAt?.toISOString() ?? null,
    lastSyncErrorAt: memory.lastSyncErrorAt?.toISOString() ?? null,
    lastSyncErrorMessage: memory.lastSyncErrorMessage,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  };
}
