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
import { useOrgRouter } from "@/lib/navigation/use-org-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import {
  memoryImportFormatFromFilename,
  readMemoryImportFile,
  suggestedMemoryNameFromFilename,
} from "@/lib/memory/decode-import-file";
import { TMX_MAX_IMPORT_CONTENT_CHARS } from "@/lib/memory/tmx/tmx-constants";

import { useActiveTmsProvider } from "../../_hooks/use-active-tms-provider";

import {
  filterMemoryListRows,
  mapLiveTmsProviderMemoryToListRow,
  mapMemoryToListRow,
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

const workspaceMemoriesQueryKey = (organizationSlug: string) => [
  "translation-memories",
  organizationSlug,
  "workspace",
];
const credentialsQueryKey = (organizationSlug: string) => [
  "translation-memory-credentials",
  organizationSlug,
];

function createEmptyMemoryForm(): MemoryCreateForm {
  return { name: "", description: "", importFile: null };
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
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<MemoryCreateForm>(() => createEmptyMemoryForm());
  const [createErrors, setCreateErrors] = useState<{ name?: string; importFile?: string }>({});
  const [selectedExternalProjectId, setSelectedExternalProjectId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { data: activeTmsProvider } = useActiveTmsProvider(organizationSlug);
  const useLiveProviderMemories = Boolean(activeTmsProvider);
  const allowCreateMemories = canCreateMemories;

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

  const workspaceMemoriesQuery = useInfiniteQuery({
    queryKey: workspaceMemoriesQueryKey(organizationSlug),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"].$get({
        param: { organizationSlug },
        query: {
          limit: String(MEMORIES_PAGE_SIZE),
          offset: String((pageParam - 1) * MEMORIES_PAGE_SIZE),
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
    },
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

  const workspaceRows = useMemo(
    () =>
      (workspaceMemoriesQuery.data?.pages ?? []).flatMap((page) =>
        page.memories.map((memory) => mapMemoryToListRow(memory, new Map(), intl)),
      ),
    [intl, workspaceMemoriesQuery.data?.pages],
  );

  const searchFilters = {
    searchQuery,
    sourceFilter: "all",
    providerFilter: "all",
    syncFilter: "all",
  } as const;

  const nativeMemories = useMemo(
    () =>
      filterMemoryListRows(
        workspaceRows.filter((memory) => memory.source === "native"),
        searchFilters,
      ),
    [searchQuery, workspaceRows],
  );
  const persistedExternalMemories = useMemo(
    () =>
      filterMemoryListRows(
        workspaceRows.filter((memory) => memory.source === "external_tms"),
        searchFilters,
      ),
    [searchQuery, workspaceRows],
  );
  const liveExternalMemories = useMemo(
    () => filterMemoryListRows(liveMemoriesQuery.data ?? [], searchFilters),
    [liveMemoriesQuery.data, searchQuery],
  );
  const externalMemories = useLiveProviderMemories
    ? liveExternalMemories
    : persistedExternalMemories;

  const nativeTotal = nativeMemories.length;
  const externalTotal = externalMemories.length;
  const nativeQueryState = {
    isLoading: workspaceMemoriesQuery.isLoading,
    isError: workspaceMemoriesQuery.isError,
    isSuccess: workspaceMemoriesQuery.isSuccess,
    error: workspaceMemoriesQuery.error,
    refetch: () => {
      void workspaceMemoriesQuery.refetch();
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
    : nativeQueryState;

  useEffect(() => {
    setSelectedExternalProjectId("");
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
      selectedExternalProjectId={selectedExternalProjectId}
      onSelectedExternalProjectIdChange={setSelectedExternalProjectId}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      hasActiveFilters={searchQuery.trim().length > 0}
      onClearFilters={() => setSearchQuery("")}
      nativeHasMore={Boolean(workspaceMemoriesQuery.hasNextPage)}
      nativeIsLoadingMore={workspaceMemoriesQuery.isFetchingNextPage}
      onNativeLoadMore={() => {
        void workspaceMemoriesQuery.fetchNextPage();
      }}
      externalHasMore={
        useLiveProviderMemories ? false : Boolean(workspaceMemoriesQuery.hasNextPage)
      }
      externalIsLoadingMore={workspaceMemoriesQuery.isFetchingNextPage}
      onExternalLoadMore={() => {
        void workspaceMemoriesQuery.fetchNextPage();
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
