"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  mapLiveTmsProviderMemoryToListRow,
  mapMemoryToListRow,
  providerLabel,
  type ApiMemory,
  type MemoryListRow,
} from "./memory-list";
import type { TmsProviderLiveTranslationMemory } from "@/lib/providers/jobs/tms-provider-live";
import {
  TranslationMemoriesPageView,
  MEMORIES_PAGE_SIZE,
  type MemoryCreateForm,
} from "./translation-memories-page-view";

const memoriesQueryKey = (organizationSlug: string, page: number) => [
  "translation-memories",
  organizationSlug,
  page,
];
const projectsQueryKey = (organizationSlug: string) => [
  "translation-memory-projects",
  organizationSlug,
];
const credentialsQueryKey = (organizationSlug: string) => [
  "translation-memory-credentials",
  organizationSlug,
];

function createEmptyMemoryForm(): MemoryCreateForm {
  return { name: "", description: "" };
}

function useMemoryFilters(memories: MemoryListRow[], searchParams: URLSearchParams) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "source", PROJECT_SOURCE_FILTERS),
  );
  const [providerFilter, setProviderFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "provider", TMS_PROVIDER_KINDS),
  );
  const [syncFilter, setSyncFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "sync", GLOSSARY_SYNC_FILTERS),
  );

  const filteredMemories = useMemo(() => {
    return memories.filter((memory) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = memory.name.toLowerCase().includes(query);
        const matchesProject = memory.externalProjectId?.toLowerCase().includes(query);
        const matchesMemoryId = memory.externalMemoryId?.toLowerCase().includes(query);
        if (!matchesName && !matchesProject && !matchesMemoryId) return false;
      }

      if (sourceFilter !== "all" && memory.source !== sourceFilter) return false;

      if (providerFilter !== "all") {
        if (memory.externalProviderKind !== providerFilter) return false;
      }

      if (syncFilter !== "all") {
        if (syncFilter === "error") {
          if (!memory.lastSyncErrorAt) return false;
        } else if (memory.syncState !== syncFilter) {
          return false;
        }
      }

      return true;
    });
  }, [memories, searchQuery, sourceFilter, providerFilter, syncFilter]);

  const activeFilterCount = [sourceFilter, providerFilter, syncFilter].filter(
    (f) => f !== "all",
  ).length;

  function clearFilters() {
    setSearchQuery("");
    setSourceFilter("all");
    setProviderFilter("all");
    setSyncFilter("all");
  }

  return {
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    providerFilter,
    setProviderFilter,
    syncFilter,
    setSyncFilter,
    filteredMemories,
    activeFilterCount,
    clearFilters,
  };
}

export function TranslationMemoriesPageContent({
  organizationSlug,
  canCreateMemories,
}: {
  organizationSlug: string;
  canCreateMemories: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<MemoryCreateForm>(() => createEmptyMemoryForm());
  const [createErrors, setCreateErrors] = useState<{ name?: string }>({});
  const [selectedExternalProjectId, setSelectedExternalProjectId] = useState("");
  const { data: activeTmsProvider } = useActiveTmsProvider(organizationSlug);
  const useLiveProviderMemories = Boolean(activeTmsProvider);
  const allowCreateMemories = canCreateMemories && !useLiveProviderMemories;

  const projectsQuery = useQuery({
    queryKey: projectsQueryKey(organizationSlug),
    enabled: !useLiveProviderMemories,
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
    enabled: !useLiveProviderMemories,
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

  const memoriesQuery = useQuery({
    queryKey: [
      ...memoriesQueryKey(organizationSlug, page),
      useLiveProviderMemories ? "live" : "native",
      selectedExternalProjectId,
    ],
    enabled: !useLiveProviderMemories || Boolean(selectedExternalProjectId),
    queryFn: async () => {
      if (useLiveProviderMemories && activeTmsProvider) {
        const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"][
          "translation-memories"
        ].$get({
          param: { organizationSlug },
          query: {
            externalProjectId: selectedExternalProjectId,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to load provider translation memories (${response.status})`);
        }

        const body = (await response.json()) as {
          translationMemories: TmsProviderLiveTranslationMemory[];
        };
        const liveRows = body.translationMemories.map((memory) =>
          mapLiveTmsProviderMemoryToListRow(memory, activeTmsProvider.providerKind),
        );

        return {
          memories: [] as ApiMemory[],
          liveRows,
          total: liveRows.length,
        };
      }

      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"].$get({
        param: { organizationSlug },
        query: {
          limit: String(MEMORIES_PAGE_SIZE),
          offset: String((page - 1) * MEMORIES_PAGE_SIZE),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load translation memories (${response.status})`);
      }

      const body = await response.json();
      return {
        memories: body.memories as ApiMemory[],
        total: body.total as number,
      };
    },
  });

  const createMemory = useMutation({
    mutationFn: async (values: MemoryCreateForm) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"].$post({
        param: { organizationSlug },
        json: {
          name: values.name.trim(),
          description: values.description.trim(),
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to create translation memory"));
      }

      return response.json();
    },
    onSuccess: async (body) => {
      await queryClient.invalidateQueries({ queryKey: ["translation-memories", organizationSlug] });
      setCreateDialogOpen(false);
      setCreateForm(createEmptyMemoryForm());
      toast.success("Translation memory created");
      router.push(`/org/${organizationSlug}/translation-memories/${body.memory.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const projectIdByExternalKey = useMemo(
    () => buildProjectIdByExternalKey(projectsQuery.data ?? []),
    [projectsQuery.data],
  );

  const memories = useMemo(() => {
    if (useLiveProviderMemories) {
      return memoriesQuery.data?.liveRows ?? [];
    }

    return (memoriesQuery.data?.memories ?? []).map((memory) =>
      mapMemoryToListRow(memory, projectIdByExternalKey),
    );
  }, [
    memoriesQuery.data?.liveRows,
    memoriesQuery.data?.memories,
    projectIdByExternalKey,
    useLiveProviderMemories,
  ]);

  const memoryTotal = memoriesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(memoryTotal / MEMORIES_PAGE_SIZE));
  const pageStart = memoryTotal === 0 ? 0 : (page - 1) * MEMORIES_PAGE_SIZE + 1;
  const pageEnd = Math.min(page * MEMORIES_PAGE_SIZE, memoryTotal);

  const providerKinds = useMemo(() => {
    const kinds = new Set<string>();
    for (const memory of memories) {
      if (memory.externalProviderKind) {
        kinds.add(memory.externalProviderKind);
      }
    }
    return [...kinds].sort((a, b) => providerLabel(a).localeCompare(providerLabel(b)));
  }, [memories]);

  const {
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    providerFilter,
    setProviderFilter,
    syncFilter,
    setSyncFilter,
    filteredMemories,
    activeFilterCount,
    clearFilters,
  } = useMemoryFilters(memories, searchParams);

  useEffect(() => {
    setPage(1);
  }, [
    organizationSlug,
    searchQuery,
    sourceFilter,
    providerFilter,
    syncFilter,
    selectedExternalProjectId,
  ]);

  useEffect(() => {
    setSelectedExternalProjectId("");
  }, [organizationSlug, useLiveProviderMemories]);

  useEffect(() => {
    if (memoriesQuery.isSuccess && page > totalPages) {
      setPage(totalPages);
    }
  }, [memoriesQuery.isSuccess, page, totalPages]);

  const hasExternalMemories = memories.some((memory) => memory.source === "external_tms");
  const connectedCredentials = (credentialsQuery.data ?? []).filter(
    (credential) => credential.validationStatus === "connected",
  );
  const hasConnectedProvider = useLiveProviderMemories
    ? Boolean(activeTmsProvider)
    : credentialsQuery.isSuccess && connectedCredentials.length > 0;

  function submitCreateMemory() {
    const errors: { name?: string } = {};
    if (!createForm.name.trim()) {
      errors.name = "Translation memory name is required.";
    }
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    createMemory.mutate(createForm);
  }

  return (
    <TranslationMemoriesPageView
      organizationSlug={organizationSlug}
      memories={filteredMemories}
      memoryTotal={memoryTotal}
      isLoading={memoriesQuery.isLoading}
      isError={memoriesQuery.isError}
      isSuccess={memoriesQuery.isSuccess}
      error={memoriesQuery.error}
      allowCreateMemories={allowCreateMemories}
      hasConnectedProvider={hasConnectedProvider}
      useLiveProviderMemories={useLiveProviderMemories}
      selectedExternalProjectId={selectedExternalProjectId}
      onSelectedExternalProjectIdChange={setSelectedExternalProjectId}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      sourceFilter={sourceFilter}
      onSourceFilterChange={setSourceFilter}
      providerFilter={providerFilter}
      onProviderFilterChange={setProviderFilter}
      syncFilter={syncFilter}
      onSyncFilterChange={setSyncFilter}
      providerKinds={providerKinds}
      hasExternalMemories={hasExternalMemories}
      hasMemories={memories.length > 0}
      activeFilterCount={activeFilterCount}
      showNoFilterMatches={
        memoriesQuery.isSuccess && memories.length > 0 && filteredMemories.length === 0
      }
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
      isCreating={createMemory.isPending}
      onSubmitCreateMemory={submitCreateMemory}
    />
  );
}
