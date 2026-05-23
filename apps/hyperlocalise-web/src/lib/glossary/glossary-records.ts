import type { Glossary } from "@/lib/database/types";

export type GlossaryRecord = {
  id: string;
  organizationId: string;
  createdByUserId: string | null;
  name: string;
  description: string;
  sourceLocale: string;
  targetLocale: string;
  status: string;
  source: "native" | "external_tms";
  externalProviderKind: Glossary["externalProviderKind"];
  externalProjectId: string | null;
  externalResourceType: Glossary["externalResourceType"];
  externalGlossaryId: string | null;
  localeCoverage: string[];
  termCount: number | null;
  syncState: string | null;
  termCapabilities: Record<string, unknown>;
  externalUrl: string | null;
  lastSyncedAt: string | null;
  lastSyncErrorAt: string | null;
  lastSyncErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

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
