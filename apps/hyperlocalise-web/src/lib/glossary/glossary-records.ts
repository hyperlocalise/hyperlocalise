import type { Glossary } from "@/lib/database/types";
import type { GlossaryRecord } from "@/api/routes/glossary/glossary.schema";

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
    externalUrl: glossary.externalUrl,
    lastSyncedAt: glossary.lastSyncedAt?.toISOString() ?? null,
    lastSyncErrorAt: glossary.lastSyncErrorAt?.toISOString() ?? null,
    lastSyncErrorMessage: glossary.lastSyncErrorMessage,
    createdAt: glossary.createdAt.toISOString(),
    updatedAt: glossary.updatedAt.toISOString(),
  };
}
