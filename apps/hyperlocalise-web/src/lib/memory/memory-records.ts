import type { MemoryRecord } from "@/api/routes/memory/memory.schema";
import type { Memory } from "@/lib/database/types";
import { sanitizeExternalUrl } from "@/lib/safe-external-url";

export function toMemoryRecord(memory: Memory): MemoryRecord {
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
    capabilityMode: memory.capabilityMode,
    segmentCapabilities: memory.segmentCapabilities,
    externalUrl: sanitizeExternalUrl(memory.externalUrl),
    lastSyncedAt: memory.lastSyncedAt?.toISOString() ?? null,
    lastSyncErrorAt: memory.lastSyncErrorAt?.toISOString() ?? null,
    lastSyncErrorMessage: memory.lastSyncErrorMessage,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  };
}
