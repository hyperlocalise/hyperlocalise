import type { MemoryRecord } from "@/api/routes/memory/memory.schema";

import { buildProjectIdByExternalKey, mapMemoryToListRow, type MemoryListRow } from "./memory-list";

const fixedNow = "2026-06-07T12:00:00.000Z";

const projectMap = buildProjectIdByExternalKey([
  {
    id: "project-1",
    externalProviderKind: "phrase",
    externalProjectId: "phrase-project-9",
  },
]);

function createApiMemory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "org-1",
    createdByUserId: null,
    name: "Product UI",
    description: "Core product translations",
    status: "active",
    source: "native",
    externalProviderKind: null,
    externalProjectId: null,
    externalMemoryId: null,
    localeCoverage: ["en-US", "fr-FR"],
    segmentCount: 1200,
    syncState: null,
    capabilityMode: null,
    segmentCapabilities: {},
    externalUrl: null,
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides,
  };
}

export function createMemoryListRow(overrides: Partial<MemoryListRow> = {}): MemoryListRow {
  return {
    ...mapMemoryToListRow(createApiMemory(), projectMap),
    ...overrides,
  };
}

export const translationMemoriesFixture: MemoryListRow[] = [
  createMemoryListRow(),
  mapMemoryToListRow(
    createApiMemory({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Phrase TM",
      description: "Marketing translations",
      source: "external_tms",
      externalProviderKind: "phrase",
      externalProjectId: "phrase-project-9",
      externalMemoryId: "tm-42",
      localeCoverage: ["en-US", "fr-FR", "de-DE", "es-ES"],
      segmentCount: 50_000,
      syncState: "synced",
      capabilityMode: "live_search",
      segmentCapabilities: { search: true },
      externalUrl: "https://phrase.com/tm/42",
      lastSyncedAt: "2026-05-20T12:00:00.000Z",
    }),
    projectMap,
  ),
  mapMemoryToListRow(
    createApiMemory({
      id: "33333333-3333-4333-8333-333333333333",
      name: "Crowdin Memory",
      description: "",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "crowdin-project-1",
      externalMemoryId: "tm-99",
      localeCoverage: ["en-US", "de-DE"],
      segmentCount: 8_500,
      syncState: "error",
      capabilityMode: "synced_import",
      lastSyncErrorAt: "2026-05-19T08:00:00.000Z",
      lastSyncErrorMessage: "Provider API rate limit exceeded",
    }),
    projectMap,
  ),
];

export function createEmptyMemoryFormFixture() {
  return {
    name: "",
    description: "",
  };
}
