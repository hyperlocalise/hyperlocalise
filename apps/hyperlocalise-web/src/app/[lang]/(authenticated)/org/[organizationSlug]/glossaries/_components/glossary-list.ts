import type { GlossaryRecord } from "@/api/routes/glossary/glossary.schema";
import type { ExternalTmsProviderKind } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import type { TmsProviderLiveGlossary } from "@/lib/providers/jobs/tms-provider-live";
import {
  formatTermCapabilityLabel,
  parseTermCapabilitySupport,
} from "@/lib/glossary/term-capabilities";

export type ApiGlossary = GlossaryRecord;

export type GlossaryListRow = {
  id: string;
  name: string;
  description: string;
  source: "native" | "external_tms";
  externalProviderKind: ApiGlossary["externalProviderKind"];
  externalProjectId: string | null;
  externalGlossaryId: string | null;
  externalResourceType: ApiGlossary["externalResourceType"];
  resourceTypeLabel: string;
  sourceLocale: string;
  targetLocale: string;
  localePairLabel: string;
  localeCoverage: string[];
  localeSummary: string;
  termCount: number | null;
  termCountLabel: string;
  syncState: string | null;
  termCapabilityLabel: string;
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

const RESOURCE_TYPE_LABELS: Record<NonNullable<ApiGlossary["externalResourceType"]>, string> = {
  glossary: "Glossary",
  term_base: "Term base",
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

function formatTermCount(count: number | null) {
  if (count === null) return "Unknown";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return `${count}`;
}

function formatLocaleCoverage(locales: string[], sourceLocale: string, targetLocale: string) {
  const coverage = locales.length > 0 ? locales : [sourceLocale, targetLocale].filter(Boolean);
  if (coverage.length === 0) return "No locales listed";
  if (coverage.length <= 3) return coverage.join(", ");
  return `${coverage.slice(0, 3).join(", ")} +${coverage.length - 3}`;
}

function resourceTypeLabelFor(glossary: ApiGlossary) {
  if (glossary.source === "native") {
    return "Workspace glossary";
  }

  if (glossary.externalResourceType) {
    return RESOURCE_TYPE_LABELS[glossary.externalResourceType];
  }

  return "Glossary";
}

export function externalProjectLookupKey(
  providerKind: string | null | undefined,
  externalProjectId: string | null | undefined,
) {
  if (!providerKind || !externalProjectId) return null;
  return `${providerKind}:${externalProjectId}`;
}

export function mapGlossaryToListRow(
  glossary: ApiGlossary,
  projectIdByExternalKey: ReadonlyMap<string, string>,
): GlossaryListRow {
  const lookupKey = externalProjectLookupKey(
    glossary.externalProviderKind,
    glossary.externalProjectId,
  );
  const termCapabilitySupport = parseTermCapabilitySupport(
    glossary.termCapabilities,
    glossary.source,
  );

  return {
    id: glossary.id,
    name: glossary.name,
    description: glossary.description.trim() || "No description",
    source: glossary.source,
    externalProviderKind: glossary.externalProviderKind,
    externalProjectId: glossary.externalProjectId,
    externalGlossaryId: glossary.externalGlossaryId,
    externalResourceType: glossary.externalResourceType,
    resourceTypeLabel: resourceTypeLabelFor(glossary),
    sourceLocale: glossary.sourceLocale,
    targetLocale: glossary.targetLocale,
    localePairLabel: `${glossary.sourceLocale} → ${glossary.targetLocale}`,
    localeCoverage: glossary.localeCoverage,
    localeSummary: formatLocaleCoverage(
      glossary.localeCoverage,
      glossary.sourceLocale,
      glossary.targetLocale,
    ),
    termCount: glossary.termCount,
    termCountLabel: formatTermCount(glossary.termCount),
    syncState: glossary.syncState,
    termCapabilityLabel: formatTermCapabilityLabel(termCapabilitySupport),
    externalUrl: glossary.externalUrl,
    lastSyncedAt: formatRelativeTimestamp(glossary.lastSyncedAt),
    lastSyncErrorAt: formatRelativeTimestamp(glossary.lastSyncErrorAt),
    lastSyncErrorMessage: glossary.lastSyncErrorMessage,
    updatedAt: formatRelativeTimestamp(glossary.updatedAt) ?? "—",
    projectLinkId: lookupKey ? (projectIdByExternalKey.get(lookupKey) ?? null) : null,
  };
}

export function mapLiveTmsProviderGlossaryToListRow(
  glossary: TmsProviderLiveGlossary,
  providerKind: ExternalTmsProviderKind,
): GlossaryListRow {
  return {
    id: glossary.id,
    name: glossary.name,
    description: glossary.description?.trim() || "No description",
    source: "external_tms",
    externalProviderKind: providerKind,
    externalProjectId: glossary.externalProjectId,
    externalGlossaryId: glossary.id.split(":").at(-1) ?? glossary.id,
    externalResourceType: "glossary",
    resourceTypeLabel: "Glossary",
    sourceLocale: glossary.sourceLocale,
    targetLocale: glossary.targetLocale,
    localePairLabel: `${glossary.sourceLocale} → ${glossary.targetLocale}`,
    localeCoverage: glossary.localeCoverage,
    localeSummary: formatLocaleCoverage(
      glossary.localeCoverage,
      glossary.sourceLocale,
      glossary.targetLocale,
    ),
    termCount: glossary.termCount,
    termCountLabel: formatTermCount(glossary.termCount),
    syncState: null,
    termCapabilityLabel: "Read-only (live)",
    externalUrl: glossary.externalUrl,
    lastSyncedAt: "Live",
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    updatedAt: "Live",
    projectLinkId: encodeProviderProjectId({
      providerKind,
      externalProjectId: glossary.externalProjectId,
    }),
  };
}

export function buildProjectIdByExternalKey(
  projects: readonly {
    id: string;
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
