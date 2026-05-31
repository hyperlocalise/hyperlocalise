"use client";

import { useEffect, type ReactNode } from "react";
import { SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

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
  return (
    <Badge variant="secondary" className="rounded-full text-[10px]">
      {providerLabel(kind)}
    </Badge>
  );
}

export function SourceOriginBadge({ origin }: { origin: ProjectFileRecord["origin"] }) {
  const label =
    origin === "combined"
      ? "Repository + Provider"
      : origin === "provider"
        ? "Provider"
        : "Repository";

  return (
    <Badge variant="outline" className="rounded-full text-[10px]">
      {label}
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
    <Badge variant="outline" className="rounded-full text-[10px] uppercase">
      {resourceType}
    </Badge>
  );
}

export function SyncStateBadge({ syncState }: { syncState: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full text-[10px]", toneClass(syncTone(syncState)))}
    >
      {syncState}
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

export function summarizeLocaleReadiness(localeReadiness: Record<string, unknown>) {
  const entries = Object.entries(localeReadiness);
  if (entries.length === 0) return null;

  const ready = entries.filter(([, value]) => value === "ready" || value === "complete").length;
  const missing = entries.filter(([, value]) => value === "missing" || value === "stale").length;
  const changed = entries.filter(([, value]) => value === "changed").length;

  const parts: string[] = [];
  if (ready > 0) parts.push(`${ready} ready`);
  if (missing > 0) parts.push(`${missing} missing`);
  if (changed > 0) parts.push(`${changed} changed`);

  return parts.length > 0 ? parts.join(" · ") : `${entries.length} locales`;
}

const originFilterLabels = {
  all: "All sources",
  repository: "Repository",
  provider: "Provider",
} as const;

const resourceTypeFilterLabels = {
  all: "All types",
  file: "Files",
  key: "Keys",
} as const;

const providerKindFilterLabels = {
  all: "All providers",
  crowdin: "Crowdin",
  smartling: "Smartling",
  phrase: "Phrase",
  lokalise: "Lokalise",
} as const;

const syncStateFilterLabels = {
  all: "All sync states",
  synced: "Synced",
  pending: "Pending",
  stale: "Stale",
  changed: "Changed",
} as const;

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

function projectFilterLabel(projectId: string, projectOptions: { id: string; name: string }[]) {
  if (projectId === "all") {
    return "All projects";
  }

  return projectOptions.find((project) => project.id === projectId)?.name ?? projectId;
}

function localeFilterLabel(locale: string) {
  return locale === "all" ? "All locales" : locale;
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
  const update = (patch: Partial<WorkspaceFileFilters>) => {
    onFiltersChange({ ...filters, ...patch });
  };

  return (
    <div className="flex flex-col gap-3">
      <FilesFilterField label="Search" className="min-w-0 flex-1">
        <div className="relative">
          <HugeiconsIcon
            icon={SearchIcon}
            strokeWidth={1.8}
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={filters.search}
            onChange={(event) => update({ search: event.target.value })}
            placeholder="Search by path, name, or provider ID"
            className="h-9 pl-9"
          />
        </div>
      </FilesFilterField>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        {showProjectFilter ? (
          <FilesFilterField label="Project" className="w-full lg:w-44">
            <Select
              value={filters.projectId}
              onValueChange={(value) => update({ projectId: value ?? "all" })}
            >
              <SelectTrigger className={filesFilterTriggerClassName}>
                <SelectValue>{projectFilterLabel(filters.projectId, projectOptions)}</SelectValue>
              </SelectTrigger>
              <SelectContent className={filesFilterSelectContentClassName}>
                <SelectItem value="all" label="All projects">
                  All projects
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

        <FilesFilterField label="Source" className="w-full lg:w-36">
          <Select
            value={filters.origin}
            onValueChange={(value) => update({ origin: value ?? "all" })}
          >
            <SelectTrigger className={filesFilterTriggerClassName}>
              <SelectValue>
                {originFilterLabels[filters.origin as keyof typeof originFilterLabels] ??
                  "All sources"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className={filesFilterSelectContentClassName}>
              {(Object.keys(originFilterLabels) as Array<keyof typeof originFilterLabels>).map(
                (option) => (
                  <SelectItem key={option} value={option} label={originFilterLabels[option]}>
                    {originFilterLabels[option]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </FilesFilterField>

        <FilesFilterField label="Type" className="w-full lg:w-32">
          <Select
            value={filters.resourceType}
            onValueChange={(value) => update({ resourceType: value ?? "all" })}
          >
            <SelectTrigger className={filesFilterTriggerClassName}>
              <SelectValue>
                {resourceTypeFilterLabels[
                  filters.resourceType as keyof typeof resourceTypeFilterLabels
                ] ?? "All types"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className={filesFilterSelectContentClassName}>
              {(
                Object.keys(resourceTypeFilterLabels) as Array<
                  keyof typeof resourceTypeFilterLabels
                >
              ).map((option) => (
                <SelectItem key={option} value={option} label={resourceTypeFilterLabels[option]}>
                  {resourceTypeFilterLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilesFilterField>

        <FilesFilterField label="Provider" className="w-full lg:w-36">
          <Select
            value={filters.providerKind}
            onValueChange={(value) => update({ providerKind: value ?? "all" })}
          >
            <SelectTrigger className={filesFilterTriggerClassName}>
              <SelectValue>
                {providerKindFilterLabels[
                  filters.providerKind as keyof typeof providerKindFilterLabels
                ] ?? "All providers"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className={filesFilterSelectContentClassName}>
              {(
                Object.keys(providerKindFilterLabels) as Array<
                  keyof typeof providerKindFilterLabels
                >
              ).map((option) => (
                <SelectItem key={option} value={option} label={providerKindFilterLabels[option]}>
                  {providerKindFilterLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilesFilterField>

        <FilesFilterField label="Locale" className="w-full lg:w-32">
          <Select
            value={filters.locale}
            onValueChange={(value) => update({ locale: value ?? "all" })}
          >
            <SelectTrigger className={filesFilterTriggerClassName}>
              <SelectValue>{localeFilterLabel(filters.locale)}</SelectValue>
            </SelectTrigger>
            <SelectContent className={filesFilterSelectContentClassName}>
              <SelectItem value="all" label="All locales">
                All locales
              </SelectItem>
              {localeOptions.map((locale) => (
                <SelectItem key={locale} value={locale} label={locale}>
                  {locale}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilesFilterField>

        <FilesFilterField label="Sync" className="w-full lg:w-36">
          <Select
            value={filters.syncState}
            onValueChange={(value) => update({ syncState: value ?? "all" })}
          >
            <SelectTrigger className={filesFilterTriggerClassName}>
              <SelectValue>
                {syncStateFilterLabels[filters.syncState as keyof typeof syncStateFilterLabels] ??
                  "All sync states"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className={filesFilterSelectContentClassName}>
              {(
                Object.keys(syncStateFilterLabels) as Array<keyof typeof syncStateFilterLabels>
              ).map((option) => (
                <SelectItem key={option} value={option} label={syncStateFilterLabels[option]}>
                  {syncStateFilterLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilesFilterField>
      </div>
    </div>
  );
}
