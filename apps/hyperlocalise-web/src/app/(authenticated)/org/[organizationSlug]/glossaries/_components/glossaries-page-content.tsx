"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpenTextIcon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";

import {
  GLOSSARY_SYNC_FILTERS,
  PROJECT_SOURCE_FILTERS,
  readWorkspaceFilterParam,
  TMS_PROVIDER_KINDS,
} from "../../_components/workspace-filter-params";
import { PageHeader } from "../../_components/workspace-resource-shared";
import {
  buildProjectIdByExternalKey,
  mapGlossaryToListRow,
  providerLabel,
  type ApiGlossary,
} from "./glossary-list";
import { GlossariesEmptyAction, GlossariesTable } from "./glossaries-table";

const GLOSSARIES_PAGE_SIZE = 100;

type GlossaryListFilters = {
  searchQuery: string;
  sourceFilter: string;
  providerFilter: string;
  resourceTypeFilter: string;
  syncFilter: string;
};

const glossariesQueryKey = (
  organizationSlug: string,
  page: number,
  filters: GlossaryListFilters,
) => ["glossaries", organizationSlug, page, filters];

function buildGlossaryListQuery(page: number, filters: GlossaryListFilters) {
  const query: {
    limit: string;
    offset: string;
    search?: string;
    source?: "native" | "external_tms";
    provider?: "crowdin" | "smartling" | "phrase" | "lokalise";
    resourceType?: "glossary" | "term_base";
    sync?: "synced" | "stale" | "syncing" | "error";
  } = {
    limit: String(GLOSSARIES_PAGE_SIZE),
    offset: String((page - 1) * GLOSSARIES_PAGE_SIZE),
  };

  const search = filters.searchQuery.trim();
  if (search) {
    query.search = search;
  }
  if (filters.sourceFilter === "native" || filters.sourceFilter === "external_tms") {
    query.source = filters.sourceFilter;
  }
  if (
    filters.providerFilter === "crowdin" ||
    filters.providerFilter === "smartling" ||
    filters.providerFilter === "phrase" ||
    filters.providerFilter === "lokalise"
  ) {
    query.provider = filters.providerFilter;
  }
  if (filters.resourceTypeFilter === "glossary" || filters.resourceTypeFilter === "term_base") {
    query.resourceType = filters.resourceTypeFilter;
  }
  if (
    filters.syncFilter === "synced" ||
    filters.syncFilter === "stale" ||
    filters.syncFilter === "syncing" ||
    filters.syncFilter === "error"
  ) {
    query.sync = filters.syncFilter;
  }

  return query;
}
const projectsQueryKey = (organizationSlug: string) => ["glossary-projects", organizationSlug];
const credentialsQueryKey = (organizationSlug: string) => [
  "glossary-credentials",
  organizationSlug,
];

function useGlossaryFilters(searchParams: URLSearchParams) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "source", PROJECT_SOURCE_FILTERS),
  );
  const [providerFilter, setProviderFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "provider", TMS_PROVIDER_KINDS),
  );
  const [resourceTypeFilter, setResourceTypeFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "resourceType", ["glossary", "term_base"]),
  );
  const [syncFilter, setSyncFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "sync", GLOSSARY_SYNC_FILTERS),
  );

  const filters = useMemo(
    () => ({
      searchQuery,
      sourceFilter,
      providerFilter,
      resourceTypeFilter,
      syncFilter,
    }),
    [searchQuery, sourceFilter, providerFilter, resourceTypeFilter, syncFilter],
  );

  const activeFilterCount = [
    searchQuery.trim() ? "search" : null,
    sourceFilter,
    providerFilter,
    resourceTypeFilter,
    syncFilter,
  ].filter((value) => value && value !== "all").length;

  const hasActiveFilters = activeFilterCount > 0;

  return {
    filters,
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    providerFilter,
    setProviderFilter,
    resourceTypeFilter,
    setResourceTypeFilter,
    syncFilter,
    setSyncFilter,
    activeFilterCount,
    hasActiveFilters,
  };
}

export function GlossariesPageContent({ organizationSlug }: { organizationSlug: string }) {
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const {
    filters,
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    providerFilter,
    setProviderFilter,
    resourceTypeFilter,
    setResourceTypeFilter,
    syncFilter,
    setSyncFilter,
    activeFilterCount,
    hasActiveFilters,
  } = useGlossaryFilters(searchParams);

  const projectsQuery = useQuery({
    queryKey: projectsQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw new Error(`Failed to load projects (${response.status})`);
      }

      const body = await response.json();
      return body.projects;
    },
  });

  const credentialsQuery = useQuery({
    queryKey: credentialsQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"][
        "external-tms-provider-credential"
      ].$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw new Error(`Failed to load provider credentials (${response.status})`);
      }

      const body = await response.json();
      return body.externalTmsProviderCredentials;
    },
  });

  const glossariesQuery = useQuery({
    queryKey: glossariesQueryKey(organizationSlug, page, filters),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries.$get({
        param: { organizationSlug },
        query: buildGlossaryListQuery(page, filters),
      });

      if (!response.ok) {
        throw new Error(`Failed to load glossaries (${response.status})`);
      }

      const body = await response.json();
      return {
        glossaries: body.glossaries as ApiGlossary[],
        total: body.total as number,
      };
    },
  });

  const projectIdByExternalKey = useMemo(
    () => buildProjectIdByExternalKey(projectsQuery.data ?? []),
    [projectsQuery.data],
  );

  const glossaries = useMemo(
    () =>
      (glossariesQuery.data?.glossaries ?? []).map((glossary) =>
        mapGlossaryToListRow(glossary, projectIdByExternalKey),
      ),
    [glossariesQuery.data?.glossaries, projectIdByExternalKey],
  );

  const glossaryTotal = glossariesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(glossaryTotal / GLOSSARIES_PAGE_SIZE));
  const pageStart = glossaryTotal === 0 ? 0 : (page - 1) * GLOSSARIES_PAGE_SIZE + 1;
  const pageEnd = Math.min(page * GLOSSARIES_PAGE_SIZE, glossaryTotal);

  const providerKinds = useMemo(() => {
    const kinds = new Set<string>();
    for (const glossary of glossaries) {
      if (glossary.externalProviderKind) {
        kinds.add(glossary.externalProviderKind);
      }
    }
    return [...kinds].sort((a, b) => providerLabel(a).localeCompare(providerLabel(b)));
  }, [glossaries]);

  const hasResourceTypes = glossaries.some((glossary) => glossary.externalResourceType);

  useEffect(() => {
    setPage(1);
  }, [organizationSlug, filters]);

  useEffect(() => {
    if (glossariesQuery.isSuccess && page > totalPages) {
      setPage(totalPages);
    }
  }, [glossariesQuery.isSuccess, page, totalPages]);

  const hasExternalGlossaries = glossaries.some((glossary) => glossary.source === "external_tms");
  const connectedCredentials = (credentialsQuery.data ?? []).filter(
    (credential) => credential.validationStatus === "connected",
  );
  const hasConnectedProvider = credentialsQuery.isSuccess && connectedCredentials.length > 0;

  const emptyTitle = hasConnectedProvider ? "No glossaries yet" : "Connect a TMS provider";
  const emptyDescription = hasConnectedProvider
    ? "Provider glossaries and term bases appear here after sync. Native workspace glossaries are listed alongside synced resources."
    : "Connect Crowdin, Phrase, Smartling, or Lokalise from Integrations to sync glossaries into this workspace.";

  const glossaryCountLabel =
    glossariesQuery.isSuccess && glossaryTotal > 0
      ? `${glossaryTotal} ${glossaryTotal === 1 ? "glossary" : "glossaries"}`
      : undefined;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        icon={BookOpenTextIcon}
        label="Workspace"
        title="Glossaries"
        description="Workspace and synced TMS glossaries and term bases. Provider glossaries stay read-only—connect credentials in Integrations."
        statusLabel={glossaryCountLabel}
      />

      {glossariesQuery.isSuccess && (glossaryTotal > 0 || hasActiveFilters) ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              placeholder="Search by name, project, or external ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:max-w-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={sourceFilter}
              onValueChange={(value) => {
                setSourceFilter(value ?? "all");
                if (value === "native") {
                  setProviderFilter("all");
                  setResourceTypeFilter("all");
                  setSyncFilter("all");
                }
              }}
            >
              <SelectTrigger className="w-fit min-w-[8rem]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="native">Workspace</SelectItem>
                <SelectItem value="external_tms">Provider</SelectItem>
              </SelectContent>
            </Select>

            {hasExternalGlossaries && sourceFilter !== "native" ? (
              <Select
                value={providerFilter}
                onValueChange={(value) => setProviderFilter(value ?? "all")}
              >
                <SelectTrigger className="w-fit min-w-[8rem]">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  {providerKinds.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {providerLabel(kind)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {hasResourceTypes && sourceFilter !== "native" ? (
              <Select
                value={resourceTypeFilter}
                onValueChange={(value) => setResourceTypeFilter(value ?? "all")}
              >
                <SelectTrigger className="w-fit min-w-[8rem]">
                  <SelectValue placeholder="Resource" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All resource types</SelectItem>
                  <SelectItem value="glossary">Glossary</SelectItem>
                  <SelectItem value="term_base">Term base</SelectItem>
                </SelectContent>
              </Select>
            ) : null}

            {hasExternalGlossaries && sourceFilter !== "native" ? (
              <Select value={syncFilter} onValueChange={(value) => setSyncFilter(value ?? "all")}>
                <SelectTrigger className="w-fit min-w-[8rem]">
                  <SelectValue placeholder="Sync" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sync states</SelectItem>
                  <SelectItem value="synced">Synced</SelectItem>
                  <SelectItem value="stale">Stale</SelectItem>
                  <SelectItem value="syncing">Syncing</SelectItem>
                  <SelectItem value="error">Sync error</SelectItem>
                </SelectContent>
              </Select>
            ) : null}

            {activeFilterCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSourceFilter("all");
                  setProviderFilter("all");
                  setResourceTypeFilter("all");
                  setSyncFilter("all");
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {glossariesQuery.isSuccess && hasActiveFilters && glossaryTotal === 0 ? (
        <div className="text-sm text-foreground/52">
          No glossaries match your filters.{" "}
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSourceFilter("all");
              setProviderFilter("all");
              setResourceTypeFilter("all");
              setSyncFilter("all");
            }}
            className="text-foreground/72 underline hover:text-foreground"
          >
            Clear filters
          </button>
        </div>
      ) : null}

      <GlossariesTable
        glossaries={glossaries}
        glossariesQuery={glossariesQuery}
        organizationSlug={organizationSlug}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyAction={<GlossariesEmptyAction organizationSlug={organizationSlug} />}
      />

      {glossariesQuery.isSuccess && glossaryTotal > GLOSSARIES_PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-foreground/52">
            Showing {pageStart}–{pageEnd} of {glossaryTotal} glossaries
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <p className="text-sm text-foreground/52">
              Page {page} of {totalPages}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
