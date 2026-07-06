import type { MemoryRecord } from "@/api/routes/memory/memory.schema";
import type { ExternalTmsProviderKind } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import type { TmsProviderLiveTranslationMemory } from "@/lib/providers/jobs/tms-provider-live";

export type ApiMemory = MemoryRecord;

export type MemoryListRow = {
  id: string;
  name: string;
  description: string;
  source: "native" | "external_tms";
  externalProviderKind: ApiMemory["externalProviderKind"];
  externalProjectId: string | null;
  externalMemoryId: string | null;
  localeCoverage: string[];
  localeSummary: string;
  segmentCount: number | null;
  segmentCountLabel: string;
  syncState: string | null;
  capabilityMode: ApiMemory["capabilityMode"];
  capabilityLabel: string;
  externalUrl: string | null;
  lastSyncedAt: string | null;
  lastSyncErrorAt: string | null;
  lastSyncErrorMessage: string | null;
  updatedAt: string;
  projectLinkId: string | null;
};

const CAPABILITY_LABELS: Record<NonNullable<ApiMemory["capabilityMode"]>, string> = {
  live_search: "Live search",
  synced_import: "Synced import",
  reference_only: "Reference only",
};

const PROVIDER_LABELS: Record<string, string> = {
  crowdin: "Crowdin",
  smartling: "Smartling",
  phrase: "Phrase",
  lokalise: "Lokalise",
};

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function providerLabel(kind: string) {
  return PROVIDER_LABELS[kind] ?? kind;
}

export function formatRelativeTimestamp(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  if (absoluteSeconds < 60) return RELATIVE_TIME_FORMATTER.format(deltaSeconds, "second");
  if (absoluteSeconds < 3_600)
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 60), "minute");
  if (absoluteSeconds < 86_400)
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 3_600), "hour");
  if (absoluteSeconds < 2_592_000)
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 86_400), "day");
  return date.toLocaleDateString();
}

function formatSegmentCount(count: number | null) {
  if (count === null) return "Unknown";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return `${count}`;
}

function formatLocaleCoverage(locales: string[]) {
  if (locales.length === 0) return "No locales listed";
  if (locales.length <= 3) return locales.join(", ");
  return `${locales.slice(0, 3).join(", ")} +${locales.length - 3}`;
}

function capabilityLabelFor(memory: ApiMemory) {
  if (memory.capabilityMode) {
    return CAPABILITY_LABELS[memory.capabilityMode];
  }

  return memory.source === "native" ? "Workspace managed" : "Provider managed";
}

export function externalProjectLookupKey(
  providerKind: string | null | undefined,
  externalProjectId: string | null | undefined,
) {
  if (!providerKind || !externalProjectId) return null;
  return `${providerKind}:${externalProjectId}`;
}

export function mapMemoryToListRow(
  memory: ApiMemory,
  projectIdByExternalKey: ReadonlyMap<string, string>,
): MemoryListRow {
  const lookupKey = externalProjectLookupKey(memory.externalProviderKind, memory.externalProjectId);

  return {
    id: memory.id,
    name: memory.name,
    description: memory.description.trim() || "No description",
    source: memory.source,
    externalProviderKind: memory.externalProviderKind,
    externalProjectId: memory.externalProjectId,
    externalMemoryId: memory.externalMemoryId,
    localeCoverage: memory.localeCoverage,
    localeSummary: formatLocaleCoverage(memory.localeCoverage),
    segmentCount: memory.segmentCount,
    segmentCountLabel: formatSegmentCount(memory.segmentCount),
    syncState: memory.syncState,
    capabilityMode: memory.capabilityMode,
    capabilityLabel: capabilityLabelFor(memory),
    externalUrl: memory.externalUrl,
    lastSyncedAt: formatRelativeTimestamp(memory.lastSyncedAt),
    lastSyncErrorAt: formatRelativeTimestamp(memory.lastSyncErrorAt),
    lastSyncErrorMessage: memory.lastSyncErrorMessage,
    updatedAt: formatRelativeTimestamp(memory.updatedAt) ?? "—",
    projectLinkId: lookupKey ? (projectIdByExternalKey.get(lookupKey) ?? null) : null,
  };
}

export function mapLiveTmsProviderMemoryToListRow(
  memory: TmsProviderLiveTranslationMemory,
  providerKind: ExternalTmsProviderKind,
): MemoryListRow {
  return {
    id: memory.id,
    name: memory.name,
    description: memory.description?.trim() || "No description",
    source: "external_tms",
    externalProviderKind: providerKind,
    externalProjectId: memory.externalProjectId,
    externalMemoryId: memory.id.split(":").at(-1) ?? memory.id,
    localeCoverage: memory.localeCoverage,
    localeSummary: formatLocaleCoverage(memory.localeCoverage),
    segmentCount: memory.segmentCount,
    segmentCountLabel: formatSegmentCount(memory.segmentCount),
    syncState: null,
    capabilityMode: "reference_only",
    capabilityLabel: "Read-only (live)",
    externalUrl: memory.externalUrl,
    lastSyncedAt: "Live",
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    updatedAt: "Live",
    projectLinkId: encodeProviderProjectId({
      providerKind,
      externalProjectId: memory.externalProjectId,
    }),
  };
}

export function buildProjectIdByExternalKey(
  projects: readonly {
    id: string;
    source?: string;
    externalProviderKind?: string | null;
    externalProjectId?: string | null;
  }[],
) {
  const map = new Map<string, string>();

  for (const project of projects) {
    const key = externalProjectLookupKey(project.externalProviderKind, project.externalProjectId);
    if (key && !map.has(key)) {
      map.set(key, project.id);
    }
  }

  return map;
}
