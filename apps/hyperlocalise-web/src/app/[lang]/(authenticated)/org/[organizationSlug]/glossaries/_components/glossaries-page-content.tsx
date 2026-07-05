"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { readApiError, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { useActiveTmsProvider } from "../../_hooks/use-active-tms-provider";

import {
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
import type { TmsProviderLiveGlossary } from "@/lib/providers/tms-provider-live";
import { GlossariesPageView, type GlossaryCreateForm } from "./glossaries-page-view";

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

function createEmptyGlossaryForm(): GlossaryCreateForm {
  return {
    name: "",
    description: "",
    sourceLocale: "en-US",
    targetLocales: ["fr-FR"],
  };
}

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
    syncFilter,
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<GlossaryCreateForm>(() => createEmptyGlossaryForm());
  const [createErrors, setCreateErrors] = useState<{ name?: string; targetLocales?: string }>({});
  const [selectedExternalProjectId, setSelectedExternalProjectId] = useState("");
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
  } = useGlossaryFilters(searchParams);
  const { data: activeTmsProvider } = useActiveTmsProvider(organizationSlug);
  const useLiveProviderGlossaries = Boolean(activeTmsProvider);
  const allowCreateGlossaries = canCreateGlossaries && !useLiveProviderGlossaries;

  const projectsQuery = useQuery({
    queryKey: projectsQueryKey(organizationSlug),
    enabled: !useLiveProviderGlossaries,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load projects");
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
        throw new Error(`Failed to load provider credentials (${response.status})`);
      }

      const body = await response.json();
      return body.externalTmsProviderCredentials;
    },
  });

  const glossariesQuery = useQuery({
    queryKey: [
      ...glossariesQueryKey(organizationSlug, page, filters),
      useLiveProviderGlossaries ? "live" : "native",
      selectedExternalProjectId,
    ],
    enabled: !useLiveProviderGlossaries || Boolean(selectedExternalProjectId),
    queryFn: async () => {
      if (useLiveProviderGlossaries && activeTmsProvider) {
        const response = await apiClient.api.orgs[":organizationSlug"][
          "tms-provider"
        ].glossaries.$get({
          param: { organizationSlug },
          query: {
            externalProjectId: selectedExternalProjectId,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to load provider glossaries (${response.status})`);
        }

        const body = (await response.json()) as { glossaries: TmsProviderLiveGlossary[] };
        const rows = body.glossaries.map((glossary: TmsProviderLiveGlossary) =>
          mapLiveTmsProviderGlossaryToListRow(glossary, activeTmsProvider.providerKind),
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
        };
      }

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
  const createGlossary = useMutation({
    mutationFn: async (values: GlossaryCreateForm) => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries.$post({
        param: { organizationSlug },
        json: {
          name: values.name.trim(),
          description: values.description.trim(),
          sourceLocale: values.sourceLocale,
          targetLocale: values.targetLocales[0] ?? "",
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to create glossary"));
      }

      return response.json();
    },
    onSuccess: async (body) => {
      await queryClient.invalidateQueries({ queryKey: ["glossaries", organizationSlug] });
      setCreateDialogOpen(false);
      setCreateForm(createEmptyGlossaryForm());
      toast.success("Glossary created");
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

  const glossaries = useMemo(() => {
    if (useLiveProviderGlossaries) {
      return glossariesQuery.data?.liveRows ?? [];
    }

    return (glossariesQuery.data?.glossaries ?? []).map((glossary) =>
      mapGlossaryToListRow(glossary, projectIdByExternalKey),
    );
  }, [
    glossariesQuery.data?.glossaries,
    glossariesQuery.data?.liveRows,
    projectIdByExternalKey,
    useLiveProviderGlossaries,
  ]);

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
  }, [organizationSlug, filters, selectedExternalProjectId]);

  useEffect(() => {
    setSelectedExternalProjectId("");
  }, [organizationSlug, useLiveProviderGlossaries]);

  useEffect(() => {
    if (glossariesQuery.isSuccess && page > totalPages) {
      setPage(totalPages);
    }
  }, [glossariesQuery.isSuccess, page, totalPages]);

  const hasExternalGlossaries = glossaries.some((glossary) => glossary.source === "external_tms");
  const connectedCredentials = (credentialsQuery.data ?? []).filter(
    (credential) => credential.validationStatus === "connected",
  );
  const hasConnectedProvider = useLiveProviderGlossaries
    ? Boolean(activeTmsProvider)
    : credentialsQuery.isSuccess && connectedCredentials.length > 0;

  function submitCreateGlossary() {
    const errors: { name?: string; targetLocales?: string } = {};
    if (!createForm.name.trim()) {
      errors.name = "Glossary name is required.";
    }
    if (createForm.targetLocales.length === 0) {
      errors.targetLocales = "Select one target locale.";
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
      glossaries={glossaries}
      glossaryTotal={glossaryTotal}
      isLoading={glossariesQuery.isLoading}
      isError={glossariesQuery.isError}
      isSuccess={glossariesQuery.isSuccess}
      error={glossariesQuery.error}
      allowCreateGlossaries={allowCreateGlossaries}
      hasConnectedProvider={hasConnectedProvider}
      useLiveProviderGlossaries={useLiveProviderGlossaries}
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
      createDialogOpen={createDialogOpen}
      onCreateDialogOpenChange={setCreateDialogOpen}
      createForm={createForm}
      onCreateFormChange={setCreateForm}
      createErrors={createErrors}
      isCreating={createGlossary.isPending}
      onSubmitCreateGlossary={submitCreateGlossary}
    />
  );
}
