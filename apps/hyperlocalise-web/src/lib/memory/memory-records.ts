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
import type { MemoryRecord } from "@/api/routes/memory/memory.schema";
import type { Memory } from "@/lib/database/types";
import { sanitizeExternalUrl } from "@/lib/security/safe-external-url";
import type {
  MemoryCapabilities,
  MemoryCapabilityResource,
} from "@/lib/memory/memory-capabilities";

export function toMemoryRecord(memory: Memory, capabilities?: MemoryCapabilities): MemoryRecord {
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
    resourceKind:
      memory.source === "native"
        ? "native"
        : memory.capabilityMode === "reference_only"
          ? "reference_only"
          : "synced",
    capabilities: capabilities ?? {
      read: { allowed: true, reason: null },
      search: {
        allowed: memory.status === "active",
        reason: memory.status === "active" ? null : "archived",
      },
      edit: { allowed: false, reason: "unsupported" },
      review: { allowed: false, reason: "unsupported" },
      import: { allowed: false, reason: "unsupported" },
      export: { allowed: true, reason: null },
      bulk_mutation: { allowed: false, reason: "unsupported" },
      archive: { allowed: false, reason: "unsupported" },
      restore: { allowed: false, reason: "unsupported" },
      delete: { allowed: false, reason: "unsupported" },
    },
  };
}

export function toVirtualMemoryRecord(
  resource: MemoryCapabilityResource,
  capabilities: MemoryCapabilities,
): MemoryRecord {
  return {
    id: resource.id,
    organizationId: resource.organizationId,
    createdByUserId: null,
    name: resource.name,
    description: resource.description,
    status: resource.status,
    source: resource.source,
    externalProviderKind: resource.externalProviderKind,
    externalProjectId: resource.externalProjectId,
    externalMemoryId: resource.externalMemoryId,
    localeCoverage: resource.localeCoverage,
    segmentCount: resource.segmentCount,
    syncState: null,
    capabilityMode: resource.capabilityMode,
    segmentCapabilities: resource.segmentCapabilities,
    externalUrl: sanitizeExternalUrl(resource.externalUrl),
    lastSyncedAt: null,
    lastSyncErrorAt: resource.lastSyncErrorAt?.toISOString() ?? null,
    lastSyncErrorMessage: resource.lastSyncErrorMessage,
    createdAt: resource.createdAt.toISOString(),
    updatedAt: resource.updatedAt.toISOString(),
    resourceKind: resource.resourceKind,
    capabilities,
  };
}
