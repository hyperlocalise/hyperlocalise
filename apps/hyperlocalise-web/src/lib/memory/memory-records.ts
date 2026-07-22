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
