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
import { GoSvcClientError, type GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { useActiveTmsProvider } from "../../_hooks/use-active-tms-provider";

import {
  buildProjectIdByExternalKey,
  mapGlossaryToListRow,
  mapLiveTmsProviderGlossaryToListRow,
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

function buildGlossaryListQuery(
  page: number,
  filters: GlossaryListFilters,
  source?: "native" | "external_tms",
) {
  const query: {
    limit: number;
    offset: number;
    search?: string;
    source?: "native" | "external_tms";
  } = {
    limit: GLOSSARIES_PAGE_SIZE,
    offset: (page - 1) * GLOSSARIES_PAGE_SIZE,
  };

  const search = filters.searchQuery.trim();
  if (search) {
    query.search = search;
  }
  if (source) query.source = source;

  return query;
}

async function fetchWorkspaceGlossaries(
  goSvcClient: GoSvcClient,
  organizationSlug: string,
  intl: ReturnType<typeof useIntl>,
  page: number,
  filters: GlossaryListFilters,
  source?: "native" | "external_tms",
): Promise<WorkspaceGlossariesResult> {
  try {
    const body = await goSvcClient.glossary.list(
      organizationSlug,
      buildGlossaryListQuery(page, filters, source),
    );
    return {
      glossaries: body.glossaries as ApiGlossary[],
      total: body.total,
    };
  } catch (error) {
    throw new Error(
      goSvcErrorMessage(
        error,
        intl.formatMessage(glossariesPageContentMessages.loadGlossariesFailed, {
          status: error instanceof GoSvcClientError ? error.status : 0,
        }),
      ),
      { cause: error },
    );
  }
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

function useGlossaryFilters() {
  const [searchQuery, setSearchQuery] = useState("");

  const filters = useMemo(() => ({ searchQuery }), [searchQuery]);

  const activeFilterCount = searchQuery.trim() ? 1 : 0;

  const hasActiveFilters = activeFilterCount > 0;

  function clearFilters() {
    setSearchQuery("");
  }

  return {
    filters,
    searchQuery,
    setSearchQuery,
    activeFilterCount,
    hasActiveFilters,
    clearFilters,
  };
}

export function GlossariesPageContent({
  organizationSlug,
  canManageGlossaries,
}: {
  organizationSlug: string;
  canManageGlossaries: boolean;
}) {
  const intl = useIntl();
  const router = useOrgRouter();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const [crowdinOrderBy, setCrowdinOrderBy] = useState(CROWDIN_GLOSSARIES_DEFAULT_ORDER);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<GlossaryCreateForm>(() => createEmptyGlossaryForm());
  const [createErrors, setCreateErrors] = useState<{ name?: string; projectIds?: string }>({});
  const [selectedExternalProjectId, setSelectedExternalProjectId] = useState("");
  const { data: activeTmsProvider } = useActiveTmsProvider(organizationSlug);
  const useLiveProviderGlossaries = Boolean(activeTmsProvider);
  const useLiveCrowdinGlossaries = activeTmsProvider?.providerKind === "crowdin";
  const allowCreateGlossaries = canManageGlossaries;
  const {
    filters,
    searchQuery,
    setSearchQuery,
    activeFilterCount,
    hasActiveFilters,
    clearFilters,
  } = useGlossaryFilters();

  const projectsQuery = useQuery({
    queryKey: projectsQueryKey(organizationSlug),
    enabled: allowCreateGlossaries,
    queryFn: async () => {
      try {
        const body = await goSvcClient.project.list(organizationSlug);
        return body.projects;
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(
            error,
            intl.formatMessage(glossariesPageContentMessages.loadProjectsFailed),
          ),
          { cause: error },
        );
      }
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

  const nativeGlossariesQuery = useInfiniteQuery({
    queryKey: ["native-glossaries", organizationSlug, filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchWorkspaceGlossaries(goSvcClient, organizationSlug, intl, pageParam, filters, "native"),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.glossaries.length, 0);
      return loaded < lastPage.total ? pages.length + 1 : undefined;
    },
  });

  const persistedExternalGlossariesQuery = useInfiniteQuery({
    queryKey: ["external-glossaries", organizationSlug, filters],
    initialPageParam: 1,
    enabled: !useLiveProviderGlossaries,
    queryFn: ({ pageParam }) =>
      fetchWorkspaceGlossaries(
        goSvcClient,
        organizationSlug,
        intl,
        pageParam,
        filters,
        "external_tms",
      ),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.glossaries.length, 0);
      return loaded < lastPage.total ? pages.length + 1 : undefined;
    },
  });

  const liveProviderGlossariesQuery = useQuery<LiveGlossariesResult>({
    queryKey: [
      "live-provider-glossaries",
      organizationSlug,
      selectedExternalProjectId,
      activeTmsProvider?.providerKind,
      filters.searchQuery,
    ],
    enabled:
      useLiveProviderGlossaries && !useLiveCrowdinGlossaries && Boolean(selectedExternalProjectId),
    queryFn: async () => {
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
        mapLiveTmsProviderGlossaryToListRow(glossary, activeTmsProvider!.providerKind, intl),
      );
      const normalizedSearch = filters.searchQuery.trim().toLowerCase();
      const filtered = rows.filter((row: GlossaryListRow) => {
        if (normalizedSearch) {
          const haystack = [row.name, row.description, row.id].join(" ").toLowerCase();
          if (!haystack.includes(normalizedSearch)) return false;
        }
        return true;
      });

      return {
        liveRows: filtered,
        total: filtered.length,
        hasMore: false,
      };
    },
  });

  const liveCrowdinGlossariesQuery = useInfiniteQuery({
    queryKey: [
      "live-crowdin-glossaries",
      organizationSlug,
      crowdinOrderBy,
      selectedExternalProjectId,
      filters.searchQuery,
    ],
    initialPageParam: 1,
    enabled: useLiveCrowdinGlossaries,
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.api.orgs[":organizationSlug"][
        "tms-provider"
      ].glossaries.$get({
        param: { organizationSlug },
        query: {
          limit: String(CROWDIN_GLOSSARIES_PAGE_SIZE),
          offset: String((pageParam - 1) * CROWDIN_GLOSSARIES_PAGE_SIZE),
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

      return {
        liveRows: rows,
        total: rows.length,
        hasMore: body.pagination?.hasMore ?? rows.length === CROWDIN_GLOSSARIES_PAGE_SIZE,
      };
    },
    getNextPageParam: (lastPage, pages) => (lastPage.hasMore ? pages.length + 1 : undefined),
  });
  const createGlossary = useMutation({
    mutationFn: async (values: GlossaryCreateForm) => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries.$post({
        param: { organizationSlug },
        json: {
          name: values.name.trim(),
          description: values.description.trim(),
          sourceLocale: values.sourceLocale,
          controlLevel: "org",
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
      void queryClient.invalidateQueries({ queryKey: ["glossaries", organizationSlug] });
      void queryClient.invalidateQueries({ queryKey: ["native-glossaries", organizationSlug] });
      void queryClient.invalidateQueries({ queryKey: ["external-glossaries", organizationSlug] });
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

  const nativeGlossaries = useMemo(
    () =>
      (nativeGlossariesQuery.data?.pages ?? []).flatMap((page) =>
        page.glossaries.map((glossary) =>
          mapGlossaryToListRow(glossary, projectIdByExternalKey, intl),
        ),
      ),
    [intl, nativeGlossariesQuery.data?.pages, projectIdByExternalKey],
  );

  const persistedExternalGlossaries = useMemo(
    () =>
      (persistedExternalGlossariesQuery.data?.pages ?? []).flatMap((page) =>
        page.glossaries.map((glossary) =>
          mapGlossaryToListRow(glossary, projectIdByExternalKey, intl),
        ),
      ),
    [intl, persistedExternalGlossariesQuery.data?.pages, projectIdByExternalKey],
  );

  const liveCrowdinGlossaries = useMemo(
    () => (liveCrowdinGlossariesQuery.data?.pages ?? []).flatMap((page) => page.liveRows),
    [liveCrowdinGlossariesQuery.data?.pages],
  );

  const externalGlossaries = useLiveCrowdinGlossaries
    ? liveCrowdinGlossaries
    : useLiveProviderGlossaries
      ? (liveProviderGlossariesQuery.data?.liveRows ?? [])
      : persistedExternalGlossaries;

  const nativeTotal = nativeGlossariesQuery.data?.pages[0]?.total ?? nativeGlossaries.length;
  const externalTotal = useLiveCrowdinGlossaries
    ? liveCrowdinGlossaries.length
    : useLiveProviderGlossaries
      ? (liveProviderGlossariesQuery.data?.total ?? externalGlossaries.length)
      : (persistedExternalGlossariesQuery.data?.pages[0]?.total ??
        persistedExternalGlossaries.length);

  useEffect(() => {
    setSelectedExternalProjectId("");
  }, [organizationSlug, useLiveProviderGlossaries, useLiveCrowdinGlossaries]);

  const connectedCredentials = (credentialsQuery.data ?? []).filter(
    (credential) => credential.validationStatus === "connected",
  );
  const hasConnectedProvider = useLiveProviderGlossaries
    ? Boolean(activeTmsProvider)
    : credentialsQuery.isSuccess && connectedCredentials.length > 0;

  const nativeQueryState = {
    isLoading: nativeGlossariesQuery.isLoading,
    isError: nativeGlossariesQuery.isError,
    isSuccess: nativeGlossariesQuery.isSuccess,
    error: nativeGlossariesQuery.error,
    refetch: () => {
      void nativeGlossariesQuery.refetch();
    },
  };
  const externalQueryState = useLiveCrowdinGlossaries
    ? {
        isLoading: liveCrowdinGlossariesQuery.isLoading,
        isError: liveCrowdinGlossariesQuery.isError,
        isSuccess: liveCrowdinGlossariesQuery.isSuccess,
        error: liveCrowdinGlossariesQuery.error,
        refetch: () => {
          void liveCrowdinGlossariesQuery.refetch();
        },
      }
    : useLiveProviderGlossaries
      ? {
          isLoading: Boolean(selectedExternalProjectId) && liveProviderGlossariesQuery.isLoading,
          isError: liveProviderGlossariesQuery.isError,
          isSuccess: !selectedExternalProjectId || liveProviderGlossariesQuery.isSuccess,
          error: liveProviderGlossariesQuery.error,
          refetch: () => {
            void liveProviderGlossariesQuery.refetch();
          },
        }
      : {
          isLoading: persistedExternalGlossariesQuery.isLoading,
          isError: persistedExternalGlossariesQuery.isError,
          isSuccess: persistedExternalGlossariesQuery.isSuccess,
          error: persistedExternalGlossariesQuery.error,
          refetch: () => {
            void persistedExternalGlossariesQuery.refetch();
          },
        };

  function submitCreateGlossary() {
    const errors: { name?: string; projectIds?: string } = {};
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
      nativeTotal={nativeTotal}
      externalTotal={externalTotal}
      nativeQuery={nativeQueryState}
      externalQuery={externalQueryState}
      allowCreateGlossaries={allowCreateGlossaries}
      hasConnectedProvider={hasConnectedProvider}
      useLiveProviderGlossaries={useLiveProviderGlossaries}
      useLiveCrowdinGlossaries={useLiveCrowdinGlossaries}
      connectedProviderKinds={
        useLiveProviderGlossaries && activeTmsProvider
          ? [activeTmsProvider.providerKind]
          : [...new Set(connectedCredentials.map((credential) => credential.providerKind))]
      }
      selectedExternalProjectId={selectedExternalProjectId}
      onSelectedExternalProjectIdChange={setSelectedExternalProjectId}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      hasActiveFilters={hasActiveFilters}
      activeFilterCount={activeFilterCount}
      onClearFilters={clearFilters}
      nativeHasMore={Boolean(nativeGlossariesQuery.hasNextPage)}
      nativeIsLoadingMore={nativeGlossariesQuery.isFetchingNextPage}
      onNativeLoadMore={() => {
        void nativeGlossariesQuery.fetchNextPage();
      }}
      externalHasMore={
        useLiveCrowdinGlossaries
          ? Boolean(liveCrowdinGlossariesQuery.hasNextPage)
          : useLiveProviderGlossaries
            ? false
            : Boolean(persistedExternalGlossariesQuery.hasNextPage)
      }
      externalIsLoadingMore={
        useLiveCrowdinGlossaries
          ? liveCrowdinGlossariesQuery.isFetchingNextPage
          : persistedExternalGlossariesQuery.isFetchingNextPage
      }
      onExternalLoadMore={() => {
        if (useLiveCrowdinGlossaries) {
          void liveCrowdinGlossariesQuery.fetchNextPage();
          return;
        }
        void persistedExternalGlossariesQuery.fetchNextPage();
      }}
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
