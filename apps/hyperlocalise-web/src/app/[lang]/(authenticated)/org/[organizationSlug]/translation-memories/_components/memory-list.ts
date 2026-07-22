/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { IntlShape } from "@formatjs/intl";

import type { MemoryRecord } from "@/api/routes/memory/memory.schema";
import type { ExternalTmsProviderKind } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import type { TmsProviderLiveTranslationMemory } from "@/lib/providers/jobs/tms-provider-live";

import { memoryListMessages } from "./memory-list.messages";

export type ApiMemory = MemoryRecord;

export type MemoryListIntl = Pick<IntlShape, "formatMessage">;

function resolveMessage(
  intl: MemoryListIntl | undefined,
  descriptor: (typeof memoryListMessages)[keyof typeof memoryListMessages],
  values?: Record<string, string | number>,
) {
  if (intl) {
    return intl.formatMessage(descriptor, values);
  }

  return typeof descriptor.defaultMessage === "string" ? descriptor.defaultMessage : "";
}

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

function formatSegmentCount(count: number | null, intl?: MemoryListIntl) {
  if (count === null) return resolveMessage(intl, memoryListMessages.unknownSegmentCount);
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return `${count}`;
}

function formatLocaleCoverage(locales: string[], intl?: MemoryListIntl) {
  if (locales.length === 0) return resolveMessage(intl, memoryListMessages.noLocalesListed);
  if (locales.length <= 3) return locales.join(", ");
  const preview = locales.slice(0, 3).join(", ");
  const overflowCount = locales.length - 3;
  if (intl) {
    return intl.formatMessage(memoryListMessages.localeCoverageOverflow, {
      locales: preview,
      count: overflowCount,
    });
  }
  return `${preview} +${overflowCount}`;
}

function capabilityLabelFor(memory: ApiMemory, intl?: MemoryListIntl) {
  if (memory.capabilityMode === "live_search") {
    return resolveMessage(intl, memoryListMessages.capabilityLiveSearch);
  }
  if (memory.capabilityMode === "synced_import") {
    return resolveMessage(intl, memoryListMessages.capabilitySyncedImport);
  }
  if (memory.capabilityMode === "reference_only") {
    return resolveMessage(intl, memoryListMessages.capabilityReferenceOnly);
  }

  return memory.source === "native"
    ? resolveMessage(intl, memoryListMessages.capabilityWorkspaceManaged)
    : resolveMessage(intl, memoryListMessages.capabilityProviderManaged);
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
  intl?: MemoryListIntl,
): MemoryListRow {
  const lookupKey = externalProjectLookupKey(memory.externalProviderKind, memory.externalProjectId);

  return {
    id: memory.id,
    name: memory.name,
    description:
      memory.description.trim() || resolveMessage(intl, memoryListMessages.noDescription),
    source: memory.source,
    externalProviderKind: memory.externalProviderKind,
    externalProjectId: memory.externalProjectId,
    externalMemoryId: memory.externalMemoryId,
    localeCoverage: memory.localeCoverage,
    localeSummary: formatLocaleCoverage(memory.localeCoverage, intl),
    segmentCount: memory.segmentCount,
    segmentCountLabel: formatSegmentCount(memory.segmentCount, intl),
    syncState: memory.syncState,
    capabilityMode: memory.capabilityMode,
    capabilityLabel: capabilityLabelFor(memory, intl),
    externalUrl: memory.externalUrl,
    lastSyncedAt: formatRelativeTimestamp(memory.lastSyncedAt),
    lastSyncErrorAt: formatRelativeTimestamp(memory.lastSyncErrorAt),
    lastSyncErrorMessage: memory.lastSyncErrorMessage,
    updatedAt:
      formatRelativeTimestamp(memory.updatedAt) ??
      resolveMessage(intl, memoryListMessages.unavailableTimestamp),
    projectLinkId: lookupKey ? (projectIdByExternalKey.get(lookupKey) ?? null) : null,
  };
}

export function mapLiveTmsProviderMemoryToListRow(
  memory: TmsProviderLiveTranslationMemory,
  providerKind: ExternalTmsProviderKind,
  intl?: MemoryListIntl,
): MemoryListRow {
  return {
    id: memory.id,
    name: memory.name,
    description:
      memory.description?.trim() || resolveMessage(intl, memoryListMessages.noDescription),
    source: "external_tms",
    externalProviderKind: providerKind,
    externalProjectId: memory.externalProjectId,
    externalMemoryId: memory.id.split(":").at(-1) ?? memory.id,
    localeCoverage: memory.localeCoverage,
    localeSummary: formatLocaleCoverage(memory.localeCoverage, intl),
    segmentCount: memory.segmentCount,
    segmentCountLabel: formatSegmentCount(memory.segmentCount, intl),
    syncState: null,
    capabilityMode: "reference_only",
    capabilityLabel: resolveMessage(intl, memoryListMessages.capabilityReadOnly),
    externalUrl: memory.externalUrl,
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    updatedAt: resolveMessage(intl, memoryListMessages.unavailableTimestamp),
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

export function filterMemoryListRows(
  memories: readonly MemoryListRow[],
  filters: {
    searchQuery: string;
    sourceFilter: string;
    providerFilter: string;
    syncFilter: string;
  },
): MemoryListRow[] {
  return memories.filter((memory) => {
    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase();
      const matchesName = memory.name.toLowerCase().includes(query);
      const matchesProject = memory.externalProjectId?.toLowerCase().includes(query);
      const matchesMemoryId = memory.externalMemoryId?.toLowerCase().includes(query);
      if (!matchesName && !matchesProject && !matchesMemoryId) return false;
    }

    if (filters.sourceFilter !== "all" && memory.source !== filters.sourceFilter) return false;

    if (filters.providerFilter !== "all") {
      if (memory.externalProviderKind !== filters.providerFilter) return false;
    }

    if (filters.syncFilter !== "all") {
      if (filters.syncFilter === "error") {
        if (!memory.lastSyncErrorAt) return false;
      } else if (memory.syncState !== filters.syncFilter) {
        return false;
      }
    }

    return true;
  });
}
