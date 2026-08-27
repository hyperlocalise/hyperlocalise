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
import type { IntlShape } from "@formatjs/intl";

import type { GlossaryRecord } from "@/api/routes/glossary/glossary.schema";
import { getLocaleLabel } from "@/lib/i18n/locales";
import type { ExternalTmsProviderKind } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import type { TmsProviderLiveGlossary } from "@/lib/providers/jobs/tms-provider-live";
import { toNativeGlossaryLocale } from "@/lib/providers/adapters/crowdin/crowdin-glossary-language";

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
  detailId: string | null;
  name: string;
  description: string;
  source: "native" | "external_tms";
  isLiveApi: boolean;
  externalProviderKind: ApiGlossary["externalProviderKind"];
  providerLogoSrc: string | null;
  externalProjectId: string | null;
  externalProjectName: string | null;
  externalGlossaryId: string | null;
  externalResourceType: ApiGlossary["externalResourceType"];
  controlLevel: ApiGlossary["controlLevel"];
  resourceTypeLabel: string;
  sourceLocale: string;
  targetLocale: string | null;
  localePairLabel: string;
  localeCoverage: string[];
  languages: ApiGlossary["languages"];
  localeSummary: string;
  sourceLocaleLabel: string;
  secondaryLocaleSummary: string;
  termCount: number | null;
  termCountLabel: string;
  projectCount: number | null;
  createdAt: string;
  syncState: string | null;
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

const PROVIDER_LOGO_SOURCES: Record<string, string> = {
  native: "/images/logo.png",
  crowdin: "/images/tms/crowdin.png",
  smartling: "/images/tms/smartling.png",
  phrase: "/images/tms/phrase.png",
  lokalise: "/images/tms/lokalise.webp",
};

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function providerLabel(kind: string) {
  return PROVIDER_LABELS[kind] ?? kind;
}

export function providerLogoSource(kind: string | null | undefined) {
  return kind ? (PROVIDER_LOGO_SOURCES[kind] ?? null) : null;
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
  targetLocale: string | null,
  intl?: GlossaryListIntl,
) {
  const coverage =
    locales.length > 0
      ? locales
      : [sourceLocale, targetLocale].filter((locale): locale is string => Boolean(locale));
  if (coverage.length === 0) return resolveMessage(intl, glossaryListMessages.noLocalesListed);
  const coverageLabels = coverage.map(getLocaleLabel);
  if (coverageLabels.length <= 3) return coverageLabels.join(", ");
  const preview = coverageLabels.slice(0, 3).join(", ");
  const overflowCount = coverage.length - 3;
  if (intl) {
    return intl.formatMessage(glossaryListMessages.localeCoverageOverflow, {
      locales: preview,
      count: overflowCount,
    });
  }
  return `${preview} +${overflowCount}`;
}

function formatLanguages(languages: ApiGlossary["languages"], intl?: GlossaryListIntl) {
  if (languages.length === 0) return resolveMessage(intl, glossaryListMessages.noLocalesListed);
  const labels = languages.map(({ locale, name }) => `${name} (${locale})`);
  if (labels.length <= 3) return labels.join(", ");
  const preview = labels.slice(0, 3).join(", ");
  const overflowCount = labels.length - 3;
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
    return resolveMessage(
      intl,
      glossary.controlLevel === "team"
        ? glossaryListMessages.resourceTypeTeamGlossary
        : glossaryListMessages.resourceTypeOrgGlossary,
    );
  }

  if (glossary.externalResourceType === "term_base") {
    return resolveMessage(intl, glossaryListMessages.resourceTypeTermBase);
  }

  return resolveMessage(intl, glossaryListMessages.resourceTypeGlossary);
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
  const resolvedLanguages =
    glossary.source === "native" && glossary.languages.length === 0
      ? [
          {
            locale: glossary.sourceLocale,
            name: getLocaleLabel(glossary.sourceLocale),
            isSource: true,
          },
        ]
      : glossary.languages;
  const localeCoverage =
    glossary.source === "native"
      ? [...new Set(resolvedLanguages.map(({ locale }) => locale))]
      : glossary.localeCoverage;
  const secondaryLocaleCoverage = localeCoverage.filter(
    (locale) => locale !== glossary.sourceLocale,
  );
  const lookupKey = externalProjectLookupKey(
    glossary.externalProviderKind,
    glossary.externalProjectId,
  );
  return {
    id: glossary.id,
    detailId: glossary.id,
    name: glossary.name,
    description:
      glossary.description.trim() || resolveMessage(intl, glossaryListMessages.noDescription),
    source: glossary.source,
    isLiveApi: false,
    externalProviderKind: glossary.externalProviderKind,
    providerLogoSrc: providerLogoSource(
      glossary.source === "native" ? "native" : glossary.externalProviderKind,
    ),
    externalProjectId: glossary.externalProjectId,
    externalProjectName: null,
    externalGlossaryId: glossary.externalGlossaryId,
    externalResourceType: glossary.externalResourceType,
    controlLevel: glossary.controlLevel,
    resourceTypeLabel: resourceTypeLabelFor(glossary, intl),
    sourceLocale: glossary.sourceLocale,
    targetLocale: glossary.targetLocale,
    localePairLabel: glossary.targetLocale
      ? `${glossary.sourceLocale} → ${glossary.targetLocale}`
      : glossary.sourceLocale,
    localeCoverage,
    languages: resolvedLanguages,
    localeSummary:
      glossary.source === "native"
        ? formatLanguages(resolvedLanguages, intl)
        : formatLocaleCoverage(
            glossary.localeCoverage,
            glossary.sourceLocale,
            glossary.targetLocale,
            intl,
          ),
    sourceLocaleLabel: getLocaleLabel(glossary.sourceLocale),
    secondaryLocaleSummary:
      secondaryLocaleCoverage.length > 0
        ? formatLocaleCoverage(secondaryLocaleCoverage, "", glossary.targetLocale, intl)
        : "",
    termCount: glossary.termCount,
    termCountLabel: formatTermCount(glossary.termCount, intl),
    projectCount: glossary.projectCount ?? 0,
    createdAt:
      formatRelativeTimestamp(glossary.createdAt) ??
      resolveMessage(intl, glossaryListMessages.unavailableTimestamp),
    syncState: glossary.syncState,
    externalUrl: glossary.externalProviderKind === "crowdin" ? null : glossary.externalUrl,
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
  const isCrowdin = providerKind === "crowdin";
  const sourceLocale = isCrowdin
    ? toNativeGlossaryLocale(glossary.sourceLocale)
    : glossary.sourceLocale;
  const targetLocale = isCrowdin
    ? toNativeGlossaryLocale(glossary.targetLocale)
    : glossary.targetLocale;
  const localeCoverage = isCrowdin
    ? [
        ...new Set([
          sourceLocale,
          ...glossary.localeCoverage.map((locale) => toNativeGlossaryLocale(locale)),
        ]),
      ]
    : glossary.localeCoverage;

  return {
    id: glossary.id,
    detailId: glossary.providerKind === "crowdin" ? glossary.id : null,
    name: glossary.name,
    description:
      glossary.description?.trim() || resolveMessage(intl, glossaryListMessages.noDescription),
    source: "external_tms",
    isLiveApi: true,
    externalProviderKind: providerKind,
    providerLogoSrc: providerLogoSource(providerKind),
    externalProjectId: glossary.externalProjectId,
    externalProjectName: glossary.projectName?.trim() || null,
    externalGlossaryId: glossary.id.split(":").at(-1) ?? glossary.id,
    externalResourceType: "glossary",
    controlLevel: "org",
    resourceTypeLabel: resolveMessage(intl, glossaryListMessages.resourceTypeGlossary),
    sourceLocale,
    targetLocale,
    localePairLabel: `${sourceLocale} → ${targetLocale}`,
    localeCoverage,
    languages: [
      {
        locale: sourceLocale,
        name: getLocaleLabel(sourceLocale),
        isSource: true,
      },
      ...localeCoverage
        .filter((locale) => locale !== sourceLocale)
        .map((locale) => ({ locale, name: getLocaleLabel(locale), isSource: false })),
    ],
    localeSummary: formatLocaleCoverage(localeCoverage, sourceLocale, targetLocale, intl),
    sourceLocaleLabel: getLocaleLabel(sourceLocale),
    secondaryLocaleSummary: formatLocaleCoverage(
      localeCoverage.filter((locale) => locale !== sourceLocale),
      "",
      targetLocale,
      intl,
    ),
    termCount: glossary.termCount,
    termCountLabel: formatTermCount(glossary.termCount, intl),
    projectCount: null,
    createdAt:
      formatRelativeTimestamp(glossary.createdAt) ??
      resolveMessage(intl, glossaryListMessages.unavailableTimestamp),
    syncState: null,
    externalUrl: isCrowdin ? null : glossary.externalUrl,
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
