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
import type { IntlShape } from "@formatjs/intl";

import type { GlossaryRecord } from "@/api/routes/glossary/glossary.schema";
import type { ExternalTmsProviderKind } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import type { TmsProviderLiveGlossary } from "@/lib/providers/jobs/tms-provider-live";
import {
  parseTermCapabilitySupport,
  type TermCapabilitySupport,
} from "@/lib/glossary/term-capabilities";

import { glossaryListMessages } from "./glossary-list.messages";

export type ApiGlossary = GlossaryRecord;

export type GlossaryListIntl = Pick<IntlShape, "formatMessage">;

function resolveMessage(
  intl: GlossaryListIntl | undefined,
  descriptor: (typeof glossaryListMessages)[keyof typeof glossaryListMessages],
  values?: Record<string, string | number>,
) {
  if (intl) {
    return intl.formatMessage(descriptor, values);
  }

  return typeof descriptor.defaultMessage === "string" ? descriptor.defaultMessage : "";
}

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
  termCapabilityTone: "watch" | "safe";
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

function formatTermCount(count: number | null, intl?: GlossaryListIntl) {
  if (count === null) return resolveMessage(intl, glossaryListMessages.unknownTermCount);
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return `${count}`;
}

function formatLocaleCoverage(
  locales: string[],
  sourceLocale: string,
  targetLocale: string,
  intl?: GlossaryListIntl,
) {
  const coverage = locales.length > 0 ? locales : [sourceLocale, targetLocale].filter(Boolean);
  if (coverage.length === 0) return resolveMessage(intl, glossaryListMessages.noLocalesListed);
  if (coverage.length <= 3) return coverage.join(", ");
  const preview = coverage.slice(0, 3).join(", ");
  const overflowCount = coverage.length - 3;
  if (intl) {
    return intl.formatMessage(glossaryListMessages.localeCoverageOverflow, {
      locales: preview,
      count: overflowCount,
    });
  }
  return `${preview} +${overflowCount}`;
}

function resourceTypeLabelFor(glossary: ApiGlossary, intl?: GlossaryListIntl) {
  if (glossary.source === "native") {
    return resolveMessage(intl, glossaryListMessages.resourceTypeWorkspaceGlossary);
  }

  if (glossary.externalResourceType === "term_base") {
    return resolveMessage(intl, glossaryListMessages.resourceTypeTermBase);
  }

  return resolveMessage(intl, glossaryListMessages.resourceTypeGlossary);
}

function termCapabilityToneFor(support: TermCapabilitySupport): "watch" | "safe" {
  if (support.preferred === null && support.forbidden === null) return "watch";
  if (support.preferred === false || support.forbidden === false) return "watch";
  return "safe";
}

function formatTermCapabilityLabel(support: TermCapabilitySupport, intl?: GlossaryListIntl) {
  const parts: string[] = [];

  if (support.preferred === true) {
    parts.push(resolveMessage(intl, glossaryListMessages.capabilityPreferred));
  } else if (support.preferred === false) {
    parts.push(resolveMessage(intl, glossaryListMessages.capabilityNoPreferred));
  }

  if (support.forbidden === true) {
    parts.push(resolveMessage(intl, glossaryListMessages.capabilityForbidden));
  } else if (support.forbidden === false) {
    parts.push(resolveMessage(intl, glossaryListMessages.capabilityNoForbidden));
  }

  if (parts.length === 0) {
    return resolveMessage(intl, glossaryListMessages.capabilityUnknown);
  }

  return parts.join(" · ");
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
  intl?: GlossaryListIntl,
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
    description:
      glossary.description.trim() || resolveMessage(intl, glossaryListMessages.noDescription),
    source: glossary.source,
    externalProviderKind: glossary.externalProviderKind,
    externalProjectId: glossary.externalProjectId,
    externalGlossaryId: glossary.externalGlossaryId,
    externalResourceType: glossary.externalResourceType,
    resourceTypeLabel: resourceTypeLabelFor(glossary, intl),
    sourceLocale: glossary.sourceLocale,
    targetLocale: glossary.targetLocale,
    localePairLabel: `${glossary.sourceLocale} → ${glossary.targetLocale}`,
    localeCoverage: glossary.localeCoverage,
    localeSummary: formatLocaleCoverage(
      glossary.localeCoverage,
      glossary.sourceLocale,
      glossary.targetLocale,
      intl,
    ),
    termCount: glossary.termCount,
    termCountLabel: formatTermCount(glossary.termCount, intl),
    syncState: glossary.syncState,
    termCapabilityLabel: formatTermCapabilityLabel(termCapabilitySupport, intl),
    termCapabilityTone: termCapabilityToneFor(termCapabilitySupport),
    externalUrl: glossary.externalUrl,
    lastSyncedAt: formatRelativeTimestamp(glossary.lastSyncedAt),
    lastSyncErrorAt: formatRelativeTimestamp(glossary.lastSyncErrorAt),
    lastSyncErrorMessage: glossary.lastSyncErrorMessage,
    updatedAt:
      formatRelativeTimestamp(glossary.updatedAt) ??
      resolveMessage(intl, glossaryListMessages.unavailableTimestamp),
    projectLinkId: lookupKey ? (projectIdByExternalKey.get(lookupKey) ?? null) : null,
  };
}

export function mapLiveTmsProviderGlossaryToListRow(
  glossary: TmsProviderLiveGlossary,
  providerKind: ExternalTmsProviderKind,
  intl?: GlossaryListIntl,
): GlossaryListRow {
  return {
    id: glossary.id,
    name: glossary.name,
    description:
      glossary.description?.trim() || resolveMessage(intl, glossaryListMessages.noDescription),
    source: "external_tms",
    externalProviderKind: providerKind,
    externalProjectId: glossary.externalProjectId,
    externalGlossaryId: glossary.id.split(":").at(-1) ?? glossary.id,
    externalResourceType: "glossary",
    resourceTypeLabel: resolveMessage(intl, glossaryListMessages.resourceTypeGlossary),
    sourceLocale: glossary.sourceLocale,
    targetLocale: glossary.targetLocale,
    localePairLabel: `${glossary.sourceLocale} → ${glossary.targetLocale}`,
    localeCoverage: glossary.localeCoverage,
    localeSummary: formatLocaleCoverage(
      glossary.localeCoverage,
      glossary.sourceLocale,
      glossary.targetLocale,
      intl,
    ),
    termCount: glossary.termCount,
    termCountLabel: formatTermCount(glossary.termCount, intl),
    syncState: null,
    termCapabilityLabel: resolveMessage(intl, glossaryListMessages.capabilityReadOnly),
    termCapabilityTone: "safe",
    externalUrl: glossary.externalUrl,
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    updatedAt: resolveMessage(intl, glossaryListMessages.unavailableTimestamp),
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
