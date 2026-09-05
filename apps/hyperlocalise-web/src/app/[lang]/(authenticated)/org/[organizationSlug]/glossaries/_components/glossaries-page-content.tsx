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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { readApiError, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

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

function buildGlossaryListQuery(
  page: number,
  filters: GlossaryListFilters,
  source?: "native" | "external_tms",
) {
  const query: {
    limit: string;
    offset: string;
    search?: string;
    source?: "native" | "external_tms";
  } = {
    limit: String(GLOSSARIES_PAGE_SIZE),
    offset: String((page - 1) * GLOSSARIES_PAGE_SIZE),
  };

  const search = filters.searchQuery.trim();
  if (search) {
    query.search = search;
  }
  if (source) query.source = source;

  return query;
}

async function fetchWorkspaceGlossaries(
  organizationSlug: string,
  intl: ReturnType<typeof useIntl>,
  page: number,
  filters: GlossaryListFilters,
  source?: "native" | "external_tms",
): Promise<WorkspaceGlossariesResult> {
  const response = await apiClient.api.orgs[":organizationSlug"].glossaries.$get({
    param: { organizationSlug },
    query: buildGlossaryListQuery(page, filters, source),
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
  const [page, setPage] = useState(1);
  const [crowdinPage, setCrowdinPage] = useState(1);
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
    queryKey: ["native-glossaries", organizationSlug, page, filters],
    enabled: useLiveProviderGlossaries,
    queryFn: () => fetchWorkspaceGlossaries(organizationSlug, intl, page, filters, "native"),
  });

  const liveCrowdinGlossariesQuery = useQuery<LiveGlossariesResult>({
    queryKey: [
      "live-crowdin-glossaries",
      organizationSlug,
      crowdinPage,
      crowdinOrderBy,
      selectedExternalProjectId,
      filters.searchQuery,
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

      return {
        liveRows: rows,
        total: rows.length,
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
      await queryClient.invalidateQueries({ queryKey: ["glossaries", organizationSlug] });
      await queryClient.invalidateQueries({ queryKey: ["native-glossaries", organizationSlug] });
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
    if (useLiveProviderGlossaries) {
      return (nativeGlossariesQuery.data?.glossaries ?? []).map((glossary) =>
        mapGlossaryToListRow(glossary, projectIdByExternalKey, intl),
      );
    }

    return persistedRows.filter((glossary) => glossary.source === "native");
  }, [
    intl,
    nativeGlossariesQuery.data?.glossaries,
    persistedRows,
    projectIdByExternalKey,
    useLiveProviderGlossaries,
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

  const nativeTotal = useLiveProviderGlossaries
    ? (nativeGlossariesQuery.data?.total ?? 0)
    : nativeGlossaries.length;
  const externalTotal = useLiveCrowdinGlossaries
    ? (liveCrowdinGlossariesQuery.data?.total ?? 0)
    : externalGlossaries.length;
  const glossaryTotal = useLiveProviderGlossaries
    ? nativeTotal + externalTotal
    : isWorkspaceGlossariesResult(glossariesQuery.data)
      ? glossariesQuery.data.total
      : externalTotal;
  const totalPages = Math.max(
    1,
    Math.ceil((useLiveProviderGlossaries ? nativeTotal : glossaryTotal) / GLOSSARIES_PAGE_SIZE),
  );
  const paginationTotal = useLiveProviderGlossaries ? nativeTotal : glossaryTotal;
  const pageStart = paginationTotal === 0 ? 0 : (page - 1) * GLOSSARIES_PAGE_SIZE + 1;
  const pageEnd = Math.min(page * GLOSSARIES_PAGE_SIZE, paginationTotal);

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
    const paginationQuery = useLiveProviderGlossaries ? nativeGlossariesQuery : glossariesQuery;
    if (paginationQuery.isSuccess && page > totalPages) {
      setPage(totalPages);
    }
  }, [glossariesQuery, nativeGlossariesQuery, page, totalPages, useLiveProviderGlossaries]);

  const connectedCredentials = (credentialsQuery.data ?? []).filter(
    (credential) => credential.validationStatus === "connected",
  );
  const hasConnectedProvider = useLiveProviderGlossaries
    ? Boolean(activeTmsProvider)
    : credentialsQuery.isSuccess && connectedCredentials.length > 0;

  const nativeQueryState = useLiveProviderGlossaries ? nativeGlossariesQuery : glossariesQuery;
  const externalQueryState = useLiveCrowdinGlossaries
    ? liveCrowdinGlossariesQuery
    : glossariesQuery;

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
