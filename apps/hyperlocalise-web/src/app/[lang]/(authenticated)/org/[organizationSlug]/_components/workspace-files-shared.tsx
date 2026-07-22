"use client";

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
import { useEffect, type ReactNode } from "react";
import { SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import type { ProjectFileRecord, ProjectFilesQuery } from "@/api/routes/project/project.schema";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/primitives/cn";

import { toneClass, type Tone } from "./workspace-resource-shared";
import {
  getOriginBadgeMessage,
  getOriginFilterMessage,
  getProviderKindFilterMessage,
  getProviderKindMessage,
  getResourceTypeBadgeMessage,
  getResourceTypeFilterMessage,
  getSyncStateBadgeMessage,
  getSyncStateFilterMessage,
  workspaceFilesSharedMessages as messages,
} from "./workspace-files-shared.messages";

export type WorkspaceFileFilters = {
  search: string;
  origin: string;
  resourceType: string;
  providerKind: string;
  locale: string;
  syncState: string;
  projectId: string;
};

type ProjectFilesApiQuery = {
  limit: string;
  search?: string;
  origin?: NonNullable<ProjectFilesQuery["origin"]>;
  resourceType?: NonNullable<ProjectFilesQuery["resourceType"]>;
  providerKind?: NonNullable<ProjectFilesQuery["providerKind"]>;
  locale?: string;
  syncState?: string;
  projectId?: string;
};

export function toProjectFilesApiQuery(filters: WorkspaceFileFilters): ProjectFilesApiQuery {
  const query: ProjectFilesApiQuery = {
    limit: "500",
  };

  const search = filters.search.trim();
  if (search) {
    query.search = search;
  }
  if (filters.origin !== "all") {
    query.origin = filters.origin as NonNullable<ProjectFilesQuery["origin"]>;
  }
  if (filters.resourceType !== "all") {
    query.resourceType = filters.resourceType as NonNullable<ProjectFilesQuery["resourceType"]>;
  }
  if (filters.providerKind !== "all") {
    query.providerKind = filters.providerKind as NonNullable<ProjectFilesQuery["providerKind"]>;
  }
  if (filters.locale !== "all") {
    query.locale = filters.locale;
  }
  if (filters.syncState !== "all") {
    query.syncState = filters.syncState;
  }
  if (filters.projectId !== "all") {
    query.projectId = filters.projectId;
  }

  return query;
}

export const defaultWorkspaceFileFilters: WorkspaceFileFilters = {
  search: "",
  origin: "all",
  resourceType: "all",
  providerKind: "all",
  locale: "all",
  syncState: "all",
  projectId: "all",
};

export function workspaceFileFiltersWithoutLocale(
  filters: WorkspaceFileFilters,
): WorkspaceFileFilters {
  return { ...filters, locale: "all" };
}

export function useStaleLocaleFilterReset(
  filters: WorkspaceFileFilters,
  onFiltersChange: (next: WorkspaceFileFilters) => void,
  localeOptions: string[],
) {
  useEffect(() => {
    if (filters.locale === "all") {
      return;
    }

    if (!localeOptions.includes(filters.locale)) {
      onFiltersChange({ ...filters, locale: "all" });
    }
  }, [filters, localeOptions, onFiltersChange]);
}

const PROVIDER_LABELS: Record<string, string> = {
  crowdin: "Crowdin",
  smartling: "Smartling",
  phrase: "Phrase",
  lokalise: "Lokalise",
};

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function formatRelativeTimestamp(value: string | null) {
  if (!value) return "—";
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

export function providerLabel(kind: string) {
  return PROVIDER_LABELS[kind] ?? kind;
}

function syncTone(syncState: string): Tone {
  switch (syncState) {
    case "synced":
      return "safe";
    case "stale":
    case "changed":
      return "watch";
    case "pending":
      return "info";
    default:
      return "info";
  }
}

export function ProviderKindBadge({ kind }: { kind: string }) {
  const intl = useIntl();
  const message = getProviderKindMessage(kind);
  const label = message ? intl.formatMessage(message) : providerLabel(kind);

  return (
    <Badge variant="secondary" className="rounded-full text-[10px]">
      {label}
    </Badge>
  );
}

export function SourceOriginBadge({ origin }: { origin: ProjectFileRecord["origin"] }) {
  return (
    <Badge variant="outline" className="rounded-full text-[10px]">
      <FormattedMessage {...getOriginBadgeMessage(origin)} />
    </Badge>
  );
}

export function ResourceTypeBadge({
  resourceType,
}: {
  resourceType: "file" | "key" | null | undefined;
}) {
  if (!resourceType) return null;
  return (
    <Badge variant="outline" className="rounded-full text-[10px]">
      <FormattedMessage {...getResourceTypeBadgeMessage(resourceType)} />
    </Badge>
  );
}

export function SyncStateBadge({ syncState }: { syncState: string }) {
  const intl = useIntl();
  const message = getSyncStateBadgeMessage(syncState);
  const label = message ? intl.formatMessage(message) : syncState;

  return (
    <Badge
      variant="outline"
      className={cn("rounded-full text-[10px]", toneClass(syncTone(syncState)))}
    >
      {label}
    </Badge>
  );
}

export function collectLocaleOptions(files: ProjectFileRecord[]) {
  const locales = new Set<string>();
  for (const file of files) {
    if (file.provider?.sourceLocale) {
      locales.add(file.provider.sourceLocale);
    }
    for (const locale of file.provider?.targetLocales ?? []) {
      locales.add(locale);
    }
  }
  return Array.from(locales).sort((a, b) => a.localeCompare(b));
}

export function summarizeLocaleReadiness(
  localeReadiness: Record<string, unknown>,
  intl: IntlShape,
) {
  const entries = Object.entries(localeReadiness);
  if (entries.length === 0) return null;

  const ready = entries.filter(([, value]) => value === "ready" || value === "complete").length;
  const missing = entries.filter(([, value]) => value === "missing" || value === "stale").length;
  const changed = entries.filter(([, value]) => value === "changed").length;

  const parts: string[] = [];
  if (ready > 0) {
    parts.push(intl.formatMessage(messages.readinessReady, { count: ready }));
  }
  if (missing > 0) {
    parts.push(intl.formatMessage(messages.readinessMissing, { count: missing }));
  }
  if (changed > 0) {
    parts.push(intl.formatMessage(messages.readinessChanged, { count: changed }));
  }

  return parts.length > 0
    ? parts.join(" · ")
    : intl.formatMessage(messages.readinessLocales, { count: entries.length });
}

const originFilterKeys = ["all", "repository", "provider"] as const;
const resourceTypeFilterKeys = ["all", "file", "key"] as const;
const providerKindFilterKeys = ["all", "crowdin", "smartling", "phrase", "lokalise"] as const;
const syncStateFilterKeys = ["all", "synced", "pending", "stale", "changed"] as const;

const filesFilterTriggerClassName =
  "h-9 min-h-9 w-full border-border bg-transparent px-3 text-sm text-foreground data-[size=default]:h-9";

const filesFilterSelectContentClassName =
  "w-max min-w-[var(--anchor-width)] max-w-[min(16rem,calc(100vw-2rem))]";

function FilesFilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function projectFilterLabel(
  intl: IntlShape,
  projectId: string,
  projectOptions: { id: string; name: string }[],
) {
  if (projectId === "all") {
    return intl.formatMessage(messages.allProjects);
  }

  return projectOptions.find((project) => project.id === projectId)?.name ?? projectId;
}

function localeFilterLabel(intl: IntlShape, locale: string) {
  return locale === "all" ? intl.formatMessage(messages.allLocales) : locale;
}

export function WorkspaceFilesFilterBar({
  filters,
  onFiltersChange,
  localeOptions,
  projectOptions,
  showProjectFilter = true,
}: {
  filters: WorkspaceFileFilters;
  onFiltersChange: (next: WorkspaceFileFilters) => void;
  localeOptions: string[];
  projectOptions: { id: string; name: string }[];
  showProjectFilter?: boolean;
}) {
  const intl = useIntl();
  const update = (patch: Partial<WorkspaceFileFilters>) => {
    onFiltersChange({ ...filters, ...patch });
  };

  const originLabel = originFilterKeys.includes(filters.origin as (typeof originFilterKeys)[number])
    ? intl.formatMessage(
        getOriginFilterMessage(filters.origin as (typeof originFilterKeys)[number]),
      )
    : intl.formatMessage(messages.allSources);
  const resourceTypeLabel = resourceTypeFilterKeys.includes(
    filters.resourceType as (typeof resourceTypeFilterKeys)[number],
  )
    ? intl.formatMessage(
        getResourceTypeFilterMessage(
          filters.resourceType as (typeof resourceTypeFilterKeys)[number],
        ),
      )
    : intl.formatMessage(messages.allTypes);
  const providerKindLabel = providerKindFilterKeys.includes(
    filters.providerKind as (typeof providerKindFilterKeys)[number],
  )
    ? intl.formatMessage(
        getProviderKindFilterMessage(
          filters.providerKind as (typeof providerKindFilterKeys)[number],
        ),
      )
    : intl.formatMessage(messages.allProviders);
  const syncStateLabel = syncStateFilterKeys.includes(
    filters.syncState as (typeof syncStateFilterKeys)[number],
  )
    ? intl.formatMessage(
        getSyncStateFilterMessage(filters.syncState as (typeof syncStateFilterKeys)[number]),
      )
    : intl.formatMessage(messages.allSyncStates);

  return (
    <div className="flex flex-col gap-3">
      <FilesFilterField label={intl.formatMessage(messages.searchLabel)} className="min-w-0 flex-1">
        <div className="relative">
          <HugeiconsIcon
            icon={SearchIcon}
            strokeWidth={1.8}
            className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={filters.search}
            onChange={(event) => update({ search: event.target.value })}
            placeholder={intl.formatMessage(messages.searchPlaceholder)}
            className="h-9 ps-9"
          />
        </div>
      </FilesFilterField>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        {showProjectFilter ? (
          <FilesFilterField
            label={intl.formatMessage(messages.projectLabel)}
            className="w-full lg:w-44"
          >
            <Select
              value={filters.projectId}
              onValueChange={(value) => update({ projectId: value ?? "all" })}
            >
              <SelectTrigger className={filesFilterTriggerClassName}>
                <SelectValue>
                  {projectFilterLabel(intl, filters.projectId, projectOptions)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className={filesFilterSelectContentClassName}>
                <SelectItem value="all" label={intl.formatMessage(messages.allProjects)}>
                  <FormattedMessage {...messages.allProjects} />
                </SelectItem>
                {projectOptions.map((project) => (
                  <SelectItem key={project.id} value={project.id} label={project.name}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilesFilterField>
        ) : null}

        <FilesFilterField
          label={intl.formatMessage(messages.sourceLabel)}
          className="w-full lg:w-36"
        >
          <Select
            value={filters.origin}
            onValueChange={(value) => update({ origin: value ?? "all" })}
          >
            <SelectTrigger className={filesFilterTriggerClassName}>
              <SelectValue>{originLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent className={filesFilterSelectContentClassName}>
              {originFilterKeys.map((option) => {
                const label = intl.formatMessage(getOriginFilterMessage(option));
                return (
                  <SelectItem key={option} value={option} label={label}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </FilesFilterField>

        <FilesFilterField label={intl.formatMessage(messages.typeLabel)} className="w-full lg:w-32">
          <Select
            value={filters.resourceType}
            onValueChange={(value) => update({ resourceType: value ?? "all" })}
          >
            <SelectTrigger className={filesFilterTriggerClassName}>
              <SelectValue>{resourceTypeLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent className={filesFilterSelectContentClassName}>
              {resourceTypeFilterKeys.map((option) => {
                const label = intl.formatMessage(getResourceTypeFilterMessage(option));
                return (
                  <SelectItem key={option} value={option} label={label}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </FilesFilterField>

        <FilesFilterField
          label={intl.formatMessage(messages.providerLabel)}
          className="w-full lg:w-36"
        >
          <Select
            value={filters.providerKind}
            onValueChange={(value) => update({ providerKind: value ?? "all" })}
          >
            <SelectTrigger className={filesFilterTriggerClassName}>
              <SelectValue>{providerKindLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent className={filesFilterSelectContentClassName}>
              {providerKindFilterKeys.map((option) => {
                const label = intl.formatMessage(getProviderKindFilterMessage(option));
                return (
                  <SelectItem key={option} value={option} label={label}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </FilesFilterField>

        <FilesFilterField
          label={intl.formatMessage(messages.localeLabel)}
          className="w-full lg:w-32"
        >
          <Select
            value={filters.locale}
            onValueChange={(value) => update({ locale: value ?? "all" })}
          >
            <SelectTrigger className={filesFilterTriggerClassName}>
              <SelectValue>{localeFilterLabel(intl, filters.locale)}</SelectValue>
            </SelectTrigger>
            <SelectContent className={filesFilterSelectContentClassName}>
              <SelectItem value="all" label={intl.formatMessage(messages.allLocales)}>
                <FormattedMessage {...messages.allLocales} />
              </SelectItem>
              {localeOptions.map((locale) => (
                <SelectItem key={locale} value={locale} label={locale}>
                  {locale}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilesFilterField>

        <FilesFilterField label={intl.formatMessage(messages.syncLabel)} className="w-full lg:w-36">
          <Select
            value={filters.syncState}
            onValueChange={(value) => update({ syncState: value ?? "all" })}
          >
            <SelectTrigger className={filesFilterTriggerClassName}>
              <SelectValue>{syncStateLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent className={filesFilterSelectContentClassName}>
              {syncStateFilterKeys.map((option) => {
                const label = intl.formatMessage(getSyncStateFilterMessage(option));
                return (
                  <SelectItem key={option} value={option} label={label}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </FilesFilterField>
      </div>
    </div>
  );
}
