"use client";

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
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { readApiError, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { useActiveTmsProvider } from "../../_hooks/use-active-tms-provider";

import {
  effectiveWorkspaceSyncFilter,
  GLOSSARY_SYNC_FILTERS,
  PROJECT_SOURCE_FILTERS,
  readWorkspaceFilterParam,
  TMS_PROVIDER_KINDS,
} from "../../_components/workspace-filter-params";
import {
  buildProjectIdByExternalKey,
  mapGlossaryToListRow,
  mapLiveTmsProviderGlossaryToListRow,
  providerLabel,
  type ApiGlossary,
  type GlossaryListRow,
} from "./glossary-list";
import type { TmsProviderLiveGlossary } from "@/lib/providers/jobs/tms-provider-live";
import {
  GlossariesPageView,
  GLOSSARIES_PAGE_SIZE,
  type GlossaryCreateForm,
} from "./glossaries-page-view";
import { glossariesPageContentMessages } from "./glossaries-page-content.messages";

type GlossaryListFilters = {
  searchQuery: string;
  sourceFilter: string;
  providerFilter: string;
  resourceTypeFilter: string;
  syncFilter: string;
};

type WorkspaceGlossariesResult = {
  glossaries: ApiGlossary[];
  total: number;
};

type LiveGlossariesResult = {
  liveRows: GlossaryListRow[];
  total: number;
  hasMore: boolean;
};

const CROWDIN_GLOSSARIES_PAGE_SIZE = 25;
const CROWDIN_GLOSSARIES_DEFAULT_ORDER = "createdAt desc,name";

function isWorkspaceGlossariesResult(
  result: WorkspaceGlossariesResult | LiveGlossariesResult | undefined,
): result is WorkspaceGlossariesResult {
  return Boolean(result && "glossaries" in result);
}

function isLiveGlossariesResult(
  result: WorkspaceGlossariesResult | LiveGlossariesResult | undefined,
): result is LiveGlossariesResult {
  return Boolean(result && "liveRows" in result);
}

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

function nativeGlossaryFilters(filters: GlossaryListFilters): GlossaryListFilters {
  return {
    ...filters,
    sourceFilter: "native",
    providerFilter: "all",
    resourceTypeFilter: "all",
    syncFilter: "all",
  };
}

async function fetchWorkspaceGlossaries(
  organizationSlug: string,
  intl: ReturnType<typeof useIntl>,
  page: number,
  filters: GlossaryListFilters,
): Promise<WorkspaceGlossariesResult> {
  const response = await apiClient.api.orgs[":organizationSlug"].glossaries.$get({
    param: { organizationSlug },
    query: buildGlossaryListQuery(page, filters),
  });

  if (!response.ok) {
    throw new Error(
      intl.formatMessage(glossariesPageContentMessages.loadGlossariesFailed, {
        status: response.status,
      }),
    );
  }

  const body = await response.json();
  return {
    glossaries: body.glossaries as ApiGlossary[],
    total: body.total as number,
  };
}
const projectsQueryKey = (organizationSlug: string) => ["glossary-projects", organizationSlug];
const credentialsQueryKey = (organizationSlug: string) => [
  "glossary-credentials",
  organizationSlug,
];

function createEmptyGlossaryForm(): GlossaryCreateForm {
  return {
    name: "",
    description: "",
    sourceLocale: "en-US",
    projectIds: [],
  };
}

function useGlossaryFilters(
  searchParams: URLSearchParams,
  options?: { ignoreSyncFilter?: boolean },
) {
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
  const effectiveSyncFilter = effectiveWorkspaceSyncFilter(
    syncFilter,
    Boolean(options?.ignoreSyncFilter),
  );

  const filters = useMemo(
    () => ({
      searchQuery,
      sourceFilter,
      providerFilter,
      resourceTypeFilter,
      syncFilter: effectiveSyncFilter,
    }),
    [searchQuery, sourceFilter, providerFilter, resourceTypeFilter, effectiveSyncFilter],
  );

  const activeFilterCount = [
    searchQuery.trim() ? "search" : null,
    sourceFilter,
    providerFilter,
    resourceTypeFilter,
    effectiveSyncFilter,
  ].filter((value) => value && value !== "all").length;

  const hasActiveFilters = activeFilterCount > 0;

  function clearFilters() {
    setSearchQuery("");
    setSourceFilter("all");
    setProviderFilter("all");
    setResourceTypeFilter("all");
    setSyncFilter("all");
  }

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
    syncFilter: effectiveSyncFilter,
    setSyncFilter,
    activeFilterCount,
    hasActiveFilters,
    clearFilters,
  };
}

export function GlossariesPageContent({
  organizationSlug,
  canCreateGlossaries,
}: {
  organizationSlug: string;
  canCreateGlossaries: boolean;
}) {
  const intl = useIntl();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [crowdinPage, setCrowdinPage] = useState(1);
  const [crowdinOrderBy, setCrowdinOrderBy] = useState(CROWDIN_GLOSSARIES_DEFAULT_ORDER);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<GlossaryCreateForm>(() => createEmptyGlossaryForm());
  const [createErrors, setCreateErrors] = useState<{ name?: string }>({});
  const [selectedExternalProjectId, setSelectedExternalProjectId] = useState("");
  const { data: activeTmsProvider } = useActiveTmsProvider(organizationSlug);
  const useLiveProviderGlossaries = Boolean(activeTmsProvider);
  const useLiveCrowdinGlossaries = activeTmsProvider?.providerKind === "crowdin";
  const allowCreateGlossaries = canCreateGlossaries && !useLiveProviderGlossaries;
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
    clearFilters,
  } = useGlossaryFilters(searchParams, {
    ignoreSyncFilter: useLiveProviderGlossaries,
  });

  const projectsQuery = useQuery({
    queryKey: projectsQueryKey(organizationSlug),
    enabled: !useLiveProviderGlossaries,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(glossariesPageContentMessages.loadProjectsFailed),
        );
      }

      const body = await response.json();
      return body.projects;
    },
  });

  const credentialsQuery = useQuery({
    queryKey: credentialsQueryKey(organizationSlug),
    enabled: !useLiveProviderGlossaries,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"][
        "external-tms-provider-credential"
      ].$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw new Error(
          intl.formatMessage(glossariesPageContentMessages.loadCredentialsFailed, {
            status: response.status,
          }),
        );
      }

      const body = await response.json();
      return body.externalTmsProviderCredentials;
    },
  });

  const glossariesQuery = useQuery<WorkspaceGlossariesResult | LiveGlossariesResult>({
    queryKey: [
      ...glossariesQueryKey(organizationSlug, page, filters),
      useLiveProviderGlossaries ? "live" : "native",
      selectedExternalProjectId,
    ],
    enabled:
      !useLiveCrowdinGlossaries &&
      (!useLiveProviderGlossaries || Boolean(selectedExternalProjectId)),
    queryFn: async () => {
      if (useLiveProviderGlossaries && activeTmsProvider) {
        const response = await apiClient.api.orgs[":organizationSlug"][
          "tms-provider"
        ].glossaries.$get({
          param: { organizationSlug },
          query: {
            externalProjectId: selectedExternalProjectId,
            limit: String(CROWDIN_GLOSSARIES_PAGE_SIZE),
            offset: "0",
            orderBy: CROWDIN_GLOSSARIES_DEFAULT_ORDER,
          },
        });

        if (!response.ok) {
          throw new Error(
            intl.formatMessage(glossariesPageContentMessages.loadProviderGlossariesFailed, {
              status: response.status,
            }),
          );
        }

        const body = (await response.json()) as { glossaries: TmsProviderLiveGlossary[] };
        const rows = body.glossaries.map((glossary: TmsProviderLiveGlossary) =>
          mapLiveTmsProviderGlossaryToListRow(glossary, activeTmsProvider.providerKind, intl),
        );
        const normalizedSearch = filters.searchQuery.trim().toLowerCase();
        const filtered = rows.filter((row: GlossaryListRow) => {
          if (normalizedSearch) {
            const haystack = [row.name, row.description, row.id].join(" ").toLowerCase();
            if (!haystack.includes(normalizedSearch)) return false;
          }
          if (filters.sourceFilter !== "all" && row.source !== filters.sourceFilter) {
            return false;
          }
          if (
            filters.providerFilter !== "all" &&
            row.externalProviderKind !== filters.providerFilter
          ) {
            return false;
          }
          return true;
        });

        return {
          glossaries: [] as ApiGlossary[],
          liveRows: filtered,
          total: filtered.length,
          hasMore: false,
        };
      }

      return fetchWorkspaceGlossaries(organizationSlug, intl, page, filters);
    },
  });

  const nativeGlossariesQuery = useQuery<WorkspaceGlossariesResult>({
    queryKey: ["native-glossaries", organizationSlug, page, nativeGlossaryFilters(filters)],
    enabled: useLiveCrowdinGlossaries,
    queryFn: () =>
      fetchWorkspaceGlossaries(organizationSlug, intl, page, nativeGlossaryFilters(filters)),
  });

  const liveCrowdinGlossariesQuery = useQuery<LiveGlossariesResult>({
    queryKey: [
      "live-crowdin-glossaries",
      organizationSlug,
      crowdinPage,
      crowdinOrderBy,
      selectedExternalProjectId,
      filters.searchQuery,
      filters.sourceFilter,
      filters.providerFilter,
      filters.resourceTypeFilter,
    ],
    enabled: useLiveCrowdinGlossaries,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"][
        "tms-provider"
      ].glossaries.$get({
        param: { organizationSlug },
        query: {
          limit: String(CROWDIN_GLOSSARIES_PAGE_SIZE),
          offset: String((crowdinPage - 1) * CROWDIN_GLOSSARIES_PAGE_SIZE),
          orderBy: crowdinOrderBy,
          ...(filters.searchQuery.trim() ? { filter: filters.searchQuery.trim() } : {}),
          ...(selectedExternalProjectId ? { externalProjectId: selectedExternalProjectId } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(
          intl.formatMessage(glossariesPageContentMessages.loadProviderGlossariesFailed, {
            status: response.status,
          }),
        );
      }

      const body = (await response.json()) as {
        glossaries: TmsProviderLiveGlossary[];
        pagination?: { hasMore?: boolean };
      };
      const rows = body.glossaries.map((glossary) =>
        mapLiveTmsProviderGlossaryToListRow(glossary, "crowdin", intl),
      );
      const filtered = rows.filter((row) => {
        if (filters.sourceFilter !== "all" && row.source !== filters.sourceFilter) {
          return false;
        }
        if (
          filters.providerFilter !== "all" &&
          row.externalProviderKind !== filters.providerFilter
        ) {
          return false;
        }
        if (filters.resourceTypeFilter !== "all" && row.externalResourceType !== "glossary") {
          return false;
        }
        return true;
      });

      return {
        liveRows: filtered,
        total: filtered.length,
        hasMore: body.pagination?.hasMore ?? rows.length === CROWDIN_GLOSSARIES_PAGE_SIZE,
      };
    },
  });
  const createGlossary = useMutation({
    mutationFn: async (values: GlossaryCreateForm) => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries.$post({
        param: { organizationSlug },
        json: {
          name: values.name.trim(),
          description: values.description.trim(),
          sourceLocale: values.sourceLocale,
          projectIds: values.projectIds,
        },
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(glossariesPageContentMessages.createGlossaryFailed),
          ),
        );
      }

      return response.json();
    },
    onSuccess: async (body) => {
      await queryClient.invalidateQueries({ queryKey: ["glossaries", organizationSlug] });
      setCreateDialogOpen(false);
      setCreateForm(createEmptyGlossaryForm());
      toast.success(intl.formatMessage(glossariesPageContentMessages.glossaryCreated));
      router.push(`/org/${organizationSlug}/glossaries/${body.glossary.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const projectIdByExternalKey = useMemo(
    () => buildProjectIdByExternalKey(projectsQuery.data ?? []),
    [projectsQuery.data],
  );

  const persistedRows = useMemo(() => {
    if (useLiveProviderGlossaries) return [];

    const result = isWorkspaceGlossariesResult(glossariesQuery.data)
      ? glossariesQuery.data
      : undefined;
    return (result?.glossaries ?? []).map((glossary) =>
      mapGlossaryToListRow(glossary, projectIdByExternalKey, intl),
    );
  }, [glossariesQuery.data, intl, projectIdByExternalKey, useLiveProviderGlossaries]);

  const legacyLiveRows = useMemo(
    () => (isLiveGlossariesResult(glossariesQuery.data) ? glossariesQuery.data.liveRows : []),
    [glossariesQuery.data],
  );

  const nativeGlossaries = useMemo(() => {
    if (useLiveCrowdinGlossaries) {
      if (
        filters.sourceFilter === "external_tms" ||
        filters.providerFilter !== "all" ||
        filters.resourceTypeFilter !== "all"
      ) {
        return [];
      }

      return (nativeGlossariesQuery.data?.glossaries ?? []).map((glossary) =>
        mapGlossaryToListRow(glossary, projectIdByExternalKey, intl),
      );
    }

    return persistedRows.filter((glossary) => glossary.source === "native");
  }, [
    filters.providerFilter,
    filters.resourceTypeFilter,
    filters.sourceFilter,
    intl,
    nativeGlossariesQuery.data?.glossaries,
    persistedRows,
    projectIdByExternalKey,
    useLiveCrowdinGlossaries,
  ]);

  const externalGlossaries = useMemo(
    () =>
      useLiveCrowdinGlossaries
        ? (liveCrowdinGlossariesQuery.data?.liveRows ?? [])
        : useLiveProviderGlossaries
          ? legacyLiveRows
          : persistedRows.filter((glossary) => glossary.source === "external_tms"),
    [
      legacyLiveRows,
      liveCrowdinGlossariesQuery.data?.liveRows,
      persistedRows,
      useLiveCrowdinGlossaries,
      useLiveProviderGlossaries,
    ],
  );

  const nativeTotal = useLiveCrowdinGlossaries
    ? nativeGlossaries.length > 0 ||
      (filters.sourceFilter === "all" &&
        filters.providerFilter === "all" &&
        filters.resourceTypeFilter === "all")
      ? (nativeGlossariesQuery.data?.total ?? 0)
      : 0
    : nativeGlossaries.length;
  const externalTotal = useLiveCrowdinGlossaries
    ? (liveCrowdinGlossariesQuery.data?.total ?? 0)
    : externalGlossaries.length;
  const glossaryTotal = useLiveCrowdinGlossaries
    ? nativeTotal + externalTotal
    : isWorkspaceGlossariesResult(glossariesQuery.data)
      ? glossariesQuery.data.total
      : externalTotal;
  const totalPages = Math.max(
    1,
    Math.ceil((useLiveCrowdinGlossaries ? nativeTotal : glossaryTotal) / GLOSSARIES_PAGE_SIZE),
  );
  const paginationTotal = useLiveCrowdinGlossaries ? nativeTotal : glossaryTotal;
  const pageStart = paginationTotal === 0 ? 0 : (page - 1) * GLOSSARIES_PAGE_SIZE + 1;
  const pageEnd = Math.min(page * GLOSSARIES_PAGE_SIZE, paginationTotal);

  const providerKinds = useMemo(() => {
    const kinds = new Set<string>();
    for (const glossary of externalGlossaries) {
      if (glossary.externalProviderKind) {
        kinds.add(glossary.externalProviderKind);
      }
    }
    if (useLiveCrowdinGlossaries) kinds.add("crowdin");
    return [...kinds].sort((a, b) => providerLabel(a).localeCompare(providerLabel(b)));
  }, [externalGlossaries, useLiveCrowdinGlossaries]);

  const hasResourceTypes = externalGlossaries.some((glossary) => glossary.externalResourceType);

  useEffect(() => {
    setPage(1);
    setCrowdinPage(1);
  }, [organizationSlug, filters, selectedExternalProjectId, useLiveCrowdinGlossaries]);

  useEffect(() => {
    setCrowdinPage(1);
  }, [crowdinOrderBy]);

  useEffect(() => {
    setSelectedExternalProjectId("");
  }, [organizationSlug, useLiveProviderGlossaries, useLiveCrowdinGlossaries]);

  useEffect(() => {
    const paginationQuery = useLiveCrowdinGlossaries ? nativeGlossariesQuery : glossariesQuery;
    if (paginationQuery.isSuccess && page > totalPages) {
      setPage(totalPages);
    }
  }, [glossariesQuery, nativeGlossariesQuery, page, totalPages, useLiveCrowdinGlossaries]);

  const hasExternalGlossaries = externalGlossaries.length > 0 || useLiveCrowdinGlossaries;
  const connectedCredentials = (credentialsQuery.data ?? []).filter(
    (credential) => credential.validationStatus === "connected",
  );
  const hasConnectedProvider = useLiveProviderGlossaries
    ? Boolean(activeTmsProvider)
    : credentialsQuery.isSuccess && connectedCredentials.length > 0;

  const idleQueryState = {
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
  } as const;
  const nativeQueryState = useLiveCrowdinGlossaries
    ? nativeGlossariesQuery
    : useLiveProviderGlossaries
      ? idleQueryState
      : glossariesQuery;
  const externalQueryState = useLiveCrowdinGlossaries
    ? liveCrowdinGlossariesQuery
    : glossariesQuery;

  function submitCreateGlossary() {
    const errors: { name?: string } = {};
    if (!createForm.name.trim()) {
      errors.name = intl.formatMessage(glossariesPageContentMessages.nameRequired);
    }
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    createGlossary.mutate(createForm);
  }

  return (
    <GlossariesPageView
      organizationSlug={organizationSlug}
      nativeGlossaries={nativeGlossaries}
      externalGlossaries={externalGlossaries}
      glossaryTotal={glossaryTotal}
      nativeTotal={nativeTotal}
      externalTotal={externalTotal}
      nativeQuery={nativeQueryState}
      externalQuery={externalQueryState}
      allowCreateGlossaries={allowCreateGlossaries}
      hasConnectedProvider={hasConnectedProvider}
      useLiveProviderGlossaries={useLiveProviderGlossaries}
      useLiveCrowdinGlossaries={useLiveCrowdinGlossaries}
      selectedExternalProjectId={selectedExternalProjectId}
      onSelectedExternalProjectIdChange={setSelectedExternalProjectId}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      sourceFilter={sourceFilter}
      onSourceFilterChange={setSourceFilter}
      providerFilter={providerFilter}
      onProviderFilterChange={setProviderFilter}
      resourceTypeFilter={resourceTypeFilter}
      onResourceTypeFilterChange={setResourceTypeFilter}
      syncFilter={syncFilter}
      onSyncFilterChange={setSyncFilter}
      providerKinds={providerKinds}
      hasExternalGlossaries={hasExternalGlossaries}
      hasResourceTypes={hasResourceTypes}
      hasActiveFilters={hasActiveFilters}
      activeFilterCount={activeFilterCount}
      onClearFilters={clearFilters}
      page={page}
      totalPages={totalPages}
      pageStart={pageStart}
      pageEnd={pageEnd}
      onPageChange={setPage}
      crowdinPage={crowdinPage}
      crowdinHasMore={liveCrowdinGlossariesQuery.data?.hasMore ?? false}
      onCrowdinPageChange={setCrowdinPage}
      crowdinOrderBy={crowdinOrderBy}
      onCrowdinOrderByChange={setCrowdinOrderBy}
      createDialogOpen={createDialogOpen}
      onCreateDialogOpenChange={setCreateDialogOpen}
      createForm={createForm}
      onCreateFormChange={setCreateForm}
      projects={(projectsQuery.data ?? []).flatMap(({ id, name, sourceLocale }) =>
        sourceLocale ? [{ id, name, sourceLocale }] : [],
      )}
      createErrors={createErrors}
      isCreating={createGlossary.isPending}
      onSubmitCreateGlossary={submitCreateGlossary}
    />
  );
}
