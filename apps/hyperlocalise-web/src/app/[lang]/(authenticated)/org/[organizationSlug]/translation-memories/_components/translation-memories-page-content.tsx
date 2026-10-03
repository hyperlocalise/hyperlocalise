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
import { useSearchParams } from "next/navigation";
import { useOrgRouter } from "@/lib/navigation/use-org-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import {
  memoryImportFormatFromFilename,
  readMemoryImportFile,
  suggestedMemoryNameFromFilename,
} from "@/lib/memory/decode-import-file";
import { TMX_MAX_IMPORT_CONTENT_CHARS } from "@/lib/memory/tmx/tmx-constants";

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
  filterMemoryListRows,
  mapLiveTmsProviderMemoryToListRow,
  mapMemoryToListRow,
  providerLabel,
  type ApiMemory,
} from "./memory-list";
import type { TmsProviderLiveTranslationMemory } from "@/lib/providers/jobs/tms-provider-live";
import {
  TranslationMemoriesPageView,
  MEMORIES_PAGE_SIZE,
  type MemoryCreateForm,
} from "./translation-memories-page-view";
import { translationMemoriesPageContentMessages } from "./translation-memories-page-content.messages";

class CreateMemoryImportError extends Error {
  memoryId: string;

  constructor(memoryId: string, message: string) {
    super(message);
    this.name = "CreateMemoryImportError";
    this.memoryId = memoryId;
  }
}

const workspaceMemoriesQueryKey = (
  organizationSlug: string,
  source: "native" | "external_tms",
  projectFilter: string,
) => ["translation-memories", organizationSlug, source, projectFilter] as const;
const projectsQueryKey = (organizationSlug: string) => [
  "translation-memory-projects",
  organizationSlug,
];
const credentialsQueryKey = (organizationSlug: string) => [
  "translation-memory-credentials",
  organizationSlug,
];

function createEmptyMemoryForm(): MemoryCreateForm {
  return { name: "", description: "", importFile: null };
}

function useMemoryListFilterState(
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
  const [syncFilter, setSyncFilter] = useState(() =>
    readWorkspaceFilterParam(searchParams, "sync", GLOSSARY_SYNC_FILTERS),
  );
  const effectiveSyncFilter = effectiveWorkspaceSyncFilter(
    syncFilter,
    Boolean(options?.ignoreSyncFilter),
  );

  const activeFilterCount = [sourceFilter, providerFilter, effectiveSyncFilter].filter(
    (filter) => filter !== "all",
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
    syncFilter: effectiveSyncFilter,
    setSyncFilter,
    activeFilterCount,
    clearFilters,
  };
}

async function fetchWorkspaceMemories(
  organizationSlug: string,
  intl: ReturnType<typeof useIntl>,
  page: number,
  source: "native" | "external_tms",
  projectFilter: string,
) {
  const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"].$get({
    param: { organizationSlug },
    query: {
      limit: String(MEMORIES_PAGE_SIZE),
      offset: String((page - 1) * MEMORIES_PAGE_SIZE),
      source,
      ...(projectFilter !== "all" ? { projectId: projectFilter } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      intl.formatMessage(translationMemoriesPageContentMessages.loadMemoriesFailed, {
        status: response.status,
      }),
    );
  }

  const body = await response.json();
  return {
    memories: body.memories as ApiMemory[],
    total: body.total as number,
  };
}

export function TranslationMemoriesPageContent({
  organizationSlug,
  canCreateMemories,
}: {
  organizationSlug: string;
  canCreateMemories: boolean;
}) {
  const intl = useIntl();
  const router = useOrgRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<MemoryCreateForm>(() => createEmptyMemoryForm());
  const [createErrors, setCreateErrors] = useState<{ name?: string; importFile?: string }>({});
  const [selectedExternalProjectId, setSelectedExternalProjectId] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const { data: activeTmsProvider } = useActiveTmsProvider(organizationSlug);
  const useLiveProviderMemories = Boolean(activeTmsProvider);
  const allowCreateMemories = canCreateMemories;
  const {
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    providerFilter,
    setProviderFilter,
    syncFilter,
    setSyncFilter,
    activeFilterCount,
    clearFilters,
  } = useMemoryListFilterState(searchParams, { ignoreSyncFilter: useLiveProviderMemories });

  const projectsQuery = useQuery({
    queryKey: projectsQueryKey(organizationSlug),
    enabled: !useLiveProviderMemories,
    queryFn: async () => {
      try {
        const body = await goSvcClient.project.list(organizationSlug);
        return body.projects;
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(
            error,
            intl.formatMessage(translationMemoriesPageContentMessages.loadProjectsFailed),
          ),
          { cause: error },
        );
      }
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
        throw new Error(
          intl.formatMessage(translationMemoriesPageContentMessages.loadCredentialsFailed, {
            status: response.status,
          }),
        );
      }

      const body = await response.json();
      return body.externalTmsProviderCredentials;
    },
  });

  const nativeMemoriesQuery = useInfiniteQuery({
    queryKey: workspaceMemoriesQueryKey(organizationSlug, "native", projectFilter),
    initialPageParam: 1,
    enabled: sourceFilter !== "external_tms",
    queryFn: ({ pageParam }) =>
      fetchWorkspaceMemories(organizationSlug, intl, pageParam, "native", projectFilter),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.memories.length, 0);
      return loaded < lastPage.total ? pages.length + 1 : undefined;
    },
  });

  const persistedExternalMemoriesQuery = useInfiniteQuery({
    queryKey: workspaceMemoriesQueryKey(organizationSlug, "external_tms", projectFilter),
    initialPageParam: 1,
    enabled: !useLiveProviderMemories && sourceFilter !== "native",
    queryFn: ({ pageParam }) =>
      fetchWorkspaceMemories(organizationSlug, intl, pageParam, "external_tms", projectFilter),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.memories.length, 0);
      return loaded < lastPage.total ? pages.length + 1 : undefined;
    },
  });

  const liveMemoriesQuery = useQuery({
    queryKey: [
      "translation-memories",
      organizationSlug,
      "live",
      selectedExternalProjectId,
      activeTmsProvider?.providerKind,
    ],
    enabled: useLiveProviderMemories && Boolean(selectedExternalProjectId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"][
        "translation-memories"
      ].$get({
        param: { organizationSlug },
        query: {
          externalProjectId: selectedExternalProjectId,
        },
      });

      if (!response.ok) {
        throw new Error(
          intl.formatMessage(translationMemoriesPageContentMessages.loadProviderMemoriesFailed, {
            status: response.status,
          }),
        );
      }

      const body = (await response.json()) as {
        translationMemories: TmsProviderLiveTranslationMemory[];
      };
      return body.translationMemories.map((memory) =>
        mapLiveTmsProviderMemoryToListRow(memory, activeTmsProvider!.providerKind, intl),
      );
    },
  });

  const createMemory = useMutation({
    mutationFn: async (values: MemoryCreateForm) => {
      const name =
        values.name.trim() ||
        (values.importFile ? suggestedMemoryNameFromFilename(values.importFile.name) : "");
      let pendingImport:
        | {
            format: "csv" | "tmx";
            content: string;
            sourceFilename: string;
            sourceByteSize: number;
          }
        | undefined;
      if (values.importFile) {
        const format = memoryImportFormatFromFilename(values.importFile.name);
        if (!format) {
          throw new Error(
            intl.formatMessage(translationMemoriesPageContentMessages.importFileInvalid),
          );
        }
        const decoded = await readMemoryImportFile(values.importFile);
        if (!decoded.ok) {
          throw new Error(
            intl.formatMessage(translationMemoriesPageContentMessages.importFileTooLarge, {
              maxMegabytes: Math.floor(TMX_MAX_IMPORT_CONTENT_CHARS / 1_000_000),
            }),
          );
        }
        pendingImport = {
          format,
          content: decoded.content,
          sourceFilename: values.importFile.name,
          sourceByteSize: values.importFile.size,
        };
      }

      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"].$post({
        param: { organizationSlug },
        json: {
          name,
          description: values.description.trim(),
        },
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(translationMemoriesPageContentMessages.createMemoryFailed),
          ),
        );
      }

      const body = await response.json();
      const memoryId = body.memory.id as string;
      if (!pendingImport) {
        return { memoryId, importAttemptId: null as string | null };
      }

      const importResponse = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].entries["import"].$post({
        param: { organizationSlug, memoryId },
        json: {
          format: pendingImport.format,
          content: pendingImport.content,
          dryRun: false,
          sourceFilename: pendingImport.sourceFilename,
          sourceByteSize: pendingImport.sourceByteSize,
        },
      });

      if (!importResponse.ok) {
        throw new CreateMemoryImportError(
          memoryId,
          await readApiError(
            importResponse,
            intl.formatMessage(translationMemoriesPageContentMessages.importAfterCreateFailed),
          ),
        );
      }

      const imported = (await importResponse.json()) as { importAttemptId?: string };
      return { memoryId, importAttemptId: imported.importAttemptId ?? null };
    },
    onSuccess: async ({ memoryId, importAttemptId }) => {
      await queryClient.invalidateQueries({ queryKey: ["translation-memories", organizationSlug] });
      setCreateDialogOpen(false);
      setCreateForm(createEmptyMemoryForm());
      toast.success(
        intl.formatMessage(
          importAttemptId
            ? translationMemoriesPageContentMessages.memoryCreatedAndImported
            : translationMemoriesPageContentMessages.memoryCreated,
        ),
      );
      router.push(
        importAttemptId
          ? `/org/${organizationSlug}/translation-memories/${memoryId}/imports/${importAttemptId}`
          : `/org/${organizationSlug}/translation-memories/${memoryId}`,
      );
    },
    onError: (error) => {
      if (error instanceof CreateMemoryImportError) {
        toast.error(
          intl.formatMessage(translationMemoriesPageContentMessages.importAfterCreateFailed),
        );
        void queryClient.invalidateQueries({
          queryKey: ["translation-memories", organizationSlug],
        });
        setCreateDialogOpen(false);
        setCreateForm(createEmptyMemoryForm());
        router.push(`/org/${organizationSlug}/translation-memories/${error.memoryId}`);
        return;
      }
      toast.error(error.message);
    },
  });

  const projectIdByExternalKey = useMemo(
    () => buildProjectIdByExternalKey(projectsQuery.data ?? []),
    [projectsQuery.data],
  );

  const listFilters = useMemo(
    () => ({
      searchQuery,
      sourceFilter,
      providerFilter,
      syncFilter,
    }),
    [searchQuery, sourceFilter, providerFilter, syncFilter],
  );

  const nativeMemoryRows = useMemo(
    () =>
      (nativeMemoriesQuery.data?.pages ?? []).flatMap((page) =>
        page.memories.map((memory) => mapMemoryToListRow(memory, projectIdByExternalKey, intl)),
      ),
    [intl, nativeMemoriesQuery.data?.pages, projectIdByExternalKey],
  );
  const persistedExternalMemoryRows = useMemo(
    () =>
      (persistedExternalMemoriesQuery.data?.pages ?? []).flatMap((page) =>
        page.memories.map((memory) => mapMemoryToListRow(memory, projectIdByExternalKey, intl)),
      ),
    [intl, persistedExternalMemoriesQuery.data?.pages, projectIdByExternalKey],
  );
  const loadedMemories = useMemo(
    () => [...nativeMemoryRows, ...persistedExternalMemoryRows, ...(liveMemoriesQuery.data ?? [])],
    [liveMemoriesQuery.data, nativeMemoryRows, persistedExternalMemoryRows],
  );
  const providerKinds = useMemo(() => {
    const kinds = new Set<string>();
    for (const memory of loadedMemories) {
      if (memory.externalProviderKind) {
        kinds.add(memory.externalProviderKind);
      }
    }
    return [...kinds].sort((left, right) =>
      providerLabel(left).localeCompare(providerLabel(right)),
    );
  }, [loadedMemories]);
  const hasExternalMemories = loadedMemories.some((memory) => memory.source === "external_tms");

  const nativeMemories = useMemo(
    () => filterMemoryListRows(nativeMemoryRows, listFilters),
    [listFilters, nativeMemoryRows],
  );
  const persistedExternalMemories = useMemo(
    () => filterMemoryListRows(persistedExternalMemoryRows, listFilters),
    [listFilters, persistedExternalMemoryRows],
  );
  const liveExternalMemories = useMemo(
    () => filterMemoryListRows(liveMemoriesQuery.data ?? [], listFilters),
    [liveMemoriesQuery.data, listFilters],
  );
  const externalMemories = useLiveProviderMemories
    ? liveExternalMemories
    : persistedExternalMemories;

  const nativeTotal = searchQuery.trim()
    ? nativeMemories.length
    : (nativeMemoriesQuery.data?.pages[0]?.total ?? nativeMemories.length);
  const externalTotal = useLiveProviderMemories
    ? liveExternalMemories.length
    : searchQuery.trim()
      ? persistedExternalMemories.length
      : (persistedExternalMemoriesQuery.data?.pages[0]?.total ?? persistedExternalMemories.length);
  const nativeQueryState = {
    isLoading: nativeMemoriesQuery.isLoading,
    isError: nativeMemoriesQuery.isError,
    isSuccess: nativeMemoriesQuery.isSuccess,
    error: nativeMemoriesQuery.error,
    refetch: () => {
      void nativeMemoriesQuery.refetch();
    },
  };
  const externalQueryState = useLiveProviderMemories
    ? {
        isLoading: Boolean(selectedExternalProjectId) && liveMemoriesQuery.isLoading,
        isError: liveMemoriesQuery.isError,
        isSuccess: !selectedExternalProjectId || liveMemoriesQuery.isSuccess,
        error: liveMemoriesQuery.error,
        refetch: () => {
          void liveMemoriesQuery.refetch();
        },
      }
    : {
        isLoading: persistedExternalMemoriesQuery.isLoading,
        isError: persistedExternalMemoriesQuery.isError,
        isSuccess: persistedExternalMemoriesQuery.isSuccess,
        error: persistedExternalMemoriesQuery.error,
        refetch: () => {
          void persistedExternalMemoriesQuery.refetch();
        },
      };

  const filterProjects = useMemo(
    () =>
      (projectsQuery.data ?? [])
        .map((project) => ({ id: project.id, name: project.name }))
        .toSorted((left, right) => left.name.localeCompare(right.name)),
    [projectsQuery.data],
  );

  const serverNativeTotal = nativeMemoriesQuery.data?.pages[0]?.total ?? 0;
  const serverExternalTotal = persistedExternalMemoriesQuery.data?.pages[0]?.total ?? 0;
  const hasLoadedMemories =
    loadedMemories.length > 0 ||
    (projectFilter !== "all" && (serverNativeTotal > 0 || serverExternalTotal > 0));

  const listsReady =
    (sourceFilter === "external_tms" || nativeQueryState.isSuccess) &&
    (sourceFilter === "native" || externalQueryState.isSuccess);
  const showNoFilterMatches =
    listsReady &&
    ((loadedMemories.length > 0 && nativeMemories.length + externalMemories.length === 0) ||
      (projectFilter !== "all" && serverNativeTotal + serverExternalTotal === 0));

  useEffect(() => {
    setSelectedExternalProjectId("");
    setProjectFilter("all");
  }, [organizationSlug, useLiveProviderMemories]);

  const connectedCredentials = (credentialsQuery.data ?? []).filter(
    (credential) => credential.validationStatus === "connected",
  );
  const hasConnectedProvider = useLiveProviderMemories
    ? Boolean(activeTmsProvider)
    : credentialsQuery.isSuccess && connectedCredentials.length > 0;

  function submitCreateMemory() {
    const errors: { name?: string; importFile?: string } = {};
    const suggestedName = createForm.importFile
      ? suggestedMemoryNameFromFilename(createForm.importFile.name)
      : "";
    if (!createForm.name.trim() && !suggestedName) {
      errors.name = intl.formatMessage(translationMemoriesPageContentMessages.nameRequired);
    }
    if (createForm.importFile && !memoryImportFormatFromFilename(createForm.importFile.name)) {
      errors.importFile = intl.formatMessage(
        translationMemoriesPageContentMessages.importFileInvalid,
      );
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
      nativeMemories={nativeMemories}
      externalMemories={externalMemories}
      nativeTotal={nativeTotal}
      externalTotal={externalTotal}
      nativeQuery={nativeQueryState}
      externalQuery={externalQueryState}
      allowCreateMemories={allowCreateMemories}
      hasConnectedProvider={hasConnectedProvider}
      useLiveProviderMemories={useLiveProviderMemories}
      connectedProviderKinds={
        useLiveProviderMemories && activeTmsProvider
          ? [activeTmsProvider.providerKind]
          : [...new Set(connectedCredentials.map((credential) => credential.providerKind))]
      }
      selectedExternalProjectId={selectedExternalProjectId}
      onSelectedExternalProjectIdChange={setSelectedExternalProjectId}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      sourceFilter={sourceFilter}
      onSourceFilterChange={setSourceFilter}
      projectFilter={projectFilter}
      onProjectFilterChange={setProjectFilter}
      projects={filterProjects}
      providerFilter={providerFilter}
      onProviderFilterChange={setProviderFilter}
      syncFilter={syncFilter}
      onSyncFilterChange={setSyncFilter}
      providerKinds={providerKinds}
      hasExternalMemories={hasExternalMemories}
      hasMemories={hasLoadedMemories}
      showNoFilterMatches={showNoFilterMatches}
      hasActiveFilters={
        searchQuery.trim().length > 0 || activeFilterCount > 0 || projectFilter !== "all"
      }
      onClearFilters={() => {
        clearFilters();
        setProjectFilter("all");
      }}
      nativeHasMore={Boolean(nativeMemoriesQuery.hasNextPage)}
      nativeIsLoadingMore={nativeMemoriesQuery.isFetchingNextPage}
      onNativeLoadMore={() => {
        void nativeMemoriesQuery.fetchNextPage();
      }}
      externalHasMore={
        useLiveProviderMemories ? false : Boolean(persistedExternalMemoriesQuery.hasNextPage)
      }
      externalIsLoadingMore={persistedExternalMemoriesQuery.isFetchingNextPage}
      onExternalLoadMore={() => {
        void persistedExternalMemoriesQuery.fetchNextPage();
      }}
      createDialogOpen={createDialogOpen}
      onCreateDialogOpenChange={setCreateDialogOpen}
      createForm={createForm}
      onCreateFormChange={setCreateForm}
      createErrors={createErrors}
      isCreating={createMemory.isPending}
      onSubmitCreateMemory={submitCreateMemory}
      onImportMemory={() => {
        setCreateErrors({});
        setCreateDialogOpen(true);
      }}
    />
  );
}
