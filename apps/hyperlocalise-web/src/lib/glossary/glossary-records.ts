/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { GlossaryRecord } from "@/api/routes/glossary/glossary.schema";
import type { Glossary } from "@/lib/database/types";
import { sanitizeExternalUrl } from "@/lib/security/safe-external-url";

export function toGlossaryRecord(glossary: Glossary): GlossaryRecord {
  return {
    id: glossary.id,
    organizationId: glossary.organizationId,
    createdByUserId: glossary.createdByUserId,
    name: glossary.name,
    description: glossary.description,
    sourceLocale: glossary.sourceLocale,
    targetLocale: glossary.targetLocale,
    status: glossary.status,
    source: glossary.source,
    externalProviderKind: glossary.externalProviderKind,
    externalProjectId: glossary.externalProjectId,
    externalResourceType: glossary.externalResourceType,
    externalGlossaryId: glossary.externalGlossaryId,
    localeCoverage: glossary.localeCoverage,
    termCount: glossary.termCount,
    syncState: glossary.syncState,
    termCapabilities: glossary.termCapabilities,
    externalUrl: sanitizeExternalUrl(glossary.externalUrl),
    lastSyncedAt: glossary.lastSyncedAt?.toISOString() ?? null,
    lastSyncErrorAt: glossary.lastSyncErrorAt?.toISOString() ?? null,
    lastSyncErrorMessage: glossary.lastSyncErrorMessage,
    createdAt: glossary.createdAt.toISOString(),
    updatedAt: glossary.updatedAt.toISOString(),
  };
}
