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
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { isCatDeferredToApp } from "@/lib/go-svc/go-svc-error";
import {
  CAT_CACHE_GC_TIME,
  CAT_QUEUE_MAX_PAGES,
  CAT_QUEUE_CACHE_BYTES,
  retainedBytes,
  installEditorCacheBudget,
} from "./content-editor-cache-budget";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";

import type { ProjectFileContentEditorQueueFilter } from "@/api/routes/project/project.schema";
import type { ProjectFileContentEditorResponse } from "@/api/routes/project/project.schema";

import {
  isServerQueueFilter,
  type ContentEditorQueueFilter,
  type ContentEditorQueueSort,
} from "@/components/content-editor/queue/content-editor-queue-filter";
import { mergeContentEditorQueuePages } from "@/components/content-editor/queue/merge-content-editor-queue-pages";
import {
  parseCatWorkspaceQueueAdvancedParam,
  parseCatWorkspaceQueueFilterParam,
  parseCatWorkspaceQueueFilterQualifierParam,
  parseCatWorkspaceQueueSortParam,
  parseCatWorkspaceSearchParam,
} from "@/lib/projects/content-editor/content-editor-workspace-query-params";
import {
  serializeAdvancedQueueFilter,
  type ContentEditorAdvancedQueueFilter,
} from "@/lib/projects/content-editor/content-editor-advanced-queue-filter";

import {
  canReuseCatQueuePlaceholderData,
  defaultCatPageLimit,
  fetchProjectFileContentEditorQueuePage,
  projectFileCatBaseQueryKey,
  projectFileCatQueryKey,
  type ProjectFileContentEditorQueuePage,
  type ProjectFileContentEditorQueuePageParam,
} from "./project-file-content-editor-api";
import {
  isSourceFileIngestInProgress,
  sourceFileIngestPollIntervalMs,
} from "@/lib/projects/files/source-file-ingest-state";

type ContentEditorFilePagination = NonNullable<
  ProjectFileContentEditorResponse["contentEditorFile"]["pagination"]
>;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

function toServerQueueFilter(
  filter: ContentEditorQueueFilter,
): ProjectFileContentEditorQueueFilter {
  return isServerQueueFilter(filter) ? filter : "all";
}

function queueStateFromInitials(input: {
  initialQueueFilter?: ContentEditorQueueFilter;
  initialQueueSort?: ContentEditorQueueSort;
  initialSearch?: string;
  initialQueueFilterQualifier?: string;
  initialQueueAdvanced?: ContentEditorAdvancedQueueFilter;
}) {
  return {
    search: input.initialSearch ?? "",
    queueFilter: input.initialQueueFilter ?? "all",
    queueSort: input.initialQueueSort ?? "file_order",
    queueFilterQualifier: input.initialQueueFilterQualifier,
    queueAdvanced: input.initialQueueAdvanced,
  } as const;
}

function queueStateFromLocationSearch(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return {
    search: parseCatWorkspaceSearchParam(params.get("search")),
    queueFilter: parseCatWorkspaceQueueFilterParam(params.get("queueFilter")) ?? "all",
    queueSort: parseCatWorkspaceQueueSortParam(params.get("queueSort")) ?? "file_order",
    queueFilterQualifier: parseCatWorkspaceQueueFilterQualifierParam(
      params.get("queueFilterQualifier"),
    ),
    queueAdvanced: parseCatWorkspaceQueueAdvancedParam(params.get("queueAdvanced")),
  } as const;
}

function queueStateForNavigation(
  input: {
    initialQueueFilter?: ContentEditorQueueFilter;
    initialQueueSort?: ContentEditorQueueSort;
    initialSearch?: string;
    initialQueueFilterQualifier?: string;
    initialQueueAdvanced?: ContentEditorAdvancedQueueFilter;
  },
  locationSearch: string,
) {
  const initial = queueStateFromInitials(input);
  const fromUrl = queueStateFromLocationSearch(locationSearch);
  return {
    ...initial,
    queueFilterQualifier: fromUrl.queueFilterQualifier ?? initial.queueFilterQualifier,
    queueAdvanced: fromUrl.queueAdvanced ?? initial.queueAdvanced,
  };
}

export function useContentEditorSegmentQuery(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  enabled?: boolean;
  initialQueueFilter?: ContentEditorQueueFilter;
  initialQueueSort?: ContentEditorQueueSort;
  initialSearch?: string;
  initialQueueFilterQualifier?: string;
  initialQueueAdvanced?: ContentEditorAdvancedQueueFilter;
  pageLimit?: number;
  sourcePaths?: string | null;
  /** Native only: one row per identical source string. */
  grouped?: boolean;
  goSvcClient?: GoSvcClient;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const locationSearch = useSearchParams()?.toString() ?? "";
  installEditorCacheBudget(queryClient);
  const providerFallback = useRef(new Set<string>());
  const restoredQueue = queueStateForNavigation(input, locationSearch);
  const [search, setSearch] = useState(restoredQueue.search);
  const [queueFilter, setQueueFilter] = useState<ContentEditorQueueFilter>(
    restoredQueue.queueFilter,
  );
  const [queueSort, setQueueSort] = useState<ContentEditorQueueSort>(restoredQueue.queueSort);
  const [queueFilterQualifier, setQueueFilterQualifier] = useState<string | undefined>(
    restoredQueue.queueFilterQualifier,
  );
  const [queueAdvanced, setQueueAdvanced] = useState<ContentEditorAdvancedQueueFilter | undefined>(
    restoredQueue.queueAdvanced,
  );
  const fileIdentity = `${input.projectId}\0${input.sourcePath}`;
  const [appliedFileIdentity, setAppliedFileIdentity] = useState(fileIdentity);
  if (appliedFileIdentity !== fileIdentity) {
    setAppliedFileIdentity(fileIdentity);
    setSearch(restoredQueue.search);
    setQueueFilter(restoredQueue.queueFilter);
    setQueueSort(restoredQueue.queueSort);
    setQueueFilterQualifier(restoredQueue.queueFilterQualifier);
    setQueueAdvanced(restoredQueue.queueAdvanced);
  }
  const limit = input.pageLimit ?? defaultCatPageLimit;
  const debouncedSearch = useDebouncedValue(search, 300);
  const isSearchPending = search !== debouncedSearch;
  const serverQueueFilter = toServerQueueFilter(queueFilter);
  const discoveredExternalResourceIdRef = useRef<string | null>(input.externalResourceId ?? null);

  useEffect(() => {
    const applyRestoredQueue = () => {
      const restored = queueStateFromLocationSearch(window.location.search);
      setSearch(restored.search);
      setQueueFilter(restored.queueFilter);
      setQueueSort(restored.queueSort);
      setQueueFilterQualifier(restored.queueFilterQualifier);
      setQueueAdvanced(restored.queueAdvanced);
    };
    window.addEventListener("popstate", applyRestoredQueue);
    return () => window.removeEventListener("popstate", applyRestoredQueue);
  }, []);

  if (input.externalResourceId) {
    discoveredExternalResourceIdRef.current = input.externalResourceId;
  }

  const resolveExternalResourceId = useCallback(() => {
    return input.externalResourceId ?? discoveredExternalResourceIdRef.current;
  }, [input.externalResourceId]);

  const serializedQueueAdvanced = serializeAdvancedQueueFilter(queueAdvanced);
  const baseQueryKey = useMemo(
    () =>
      projectFileCatBaseQueryKey({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        externalResourceId: input.externalResourceId,
        resourceType: input.resourceType,
        targetLocale: input.targetLocale,
        search: debouncedSearch,
        queueFilter: serverQueueFilter,
        queueSort,
        queueFilterQualifier,
        queueAdvanced: serializedQueueAdvanced,
        limit,
        sourcePaths: input.sourcePaths,
        grouped: input.grouped,
      }),
    [
      input.grouped,
      debouncedSearch,
      input.organizationSlug,
      input.projectId,
      input.sourcePath,
      input.externalResourceId,
      input.resourceType,
      input.targetLocale,
      input.sourcePaths,
      limit,
      serverQueueFilter,
      queueSort,
      queueFilterQualifier,
      serializedQueueAdvanced,
    ],
  );

  const contentEditorQuery = useInfiniteQuery<
    ProjectFileContentEditorQueuePage,
    Error,
    InfiniteData<ProjectFileContentEditorQueuePage, ProjectFileContentEditorQueuePageParam>,
    ReturnType<typeof projectFileCatBaseQueryKey>,
    ProjectFileContentEditorQueuePageParam
  >({
    queryKey: baseQueryKey,
    enabled: input.enabled !== false && Boolean(input.targetLocale) && Boolean(input.sourcePath),
    placeholderData: (previousData, previousQuery) => {
      if (
        previousData === undefined ||
        previousQuery === undefined ||
        !canReuseCatQueuePlaceholderData(previousQuery.queryKey, baseQueryKey)
      ) {
        return undefined;
      }

      return previousData;
    },
    refetchInterval: (query) => {
      const page = query.state.data?.pages[0];
      if (!page || page.segments.length > 0) {
        return false;
      }
      return isSourceFileIngestInProgress(page.ingestState)
        ? sourceFileIngestPollIntervalMs
        : false;
    },
    gcTime: CAT_CACHE_GC_TIME,
    maxPages:
      input.goSvcClient &&
      !input.externalResourceId &&
      !providerFallback.current.has(input.projectId)
        ? CAT_QUEUE_MAX_PAGES
        : undefined,
    getPreviousPageParam: (firstPage) =>
      firstPage.provider || !firstPage.pagination?.offset
        ? undefined
        : { offset: Math.max(0, firstPage.pagination.offset - limit) },
    initialPageParam: { offset: 0 },
    getNextPageParam: (lastPage) => {
      const pagePagination = lastPage.pagination;
      if (!pagePagination?.hasMore) {
        return undefined;
      }

      return {
        offset: pagePagination.offset + pagePagination.returnedCount,
        phraseScanPage: pagePagination.nextPhraseScanPage,
        phraseScanSkip: pagePagination.nextPhraseScanSkip,
        sortBucket: pagePagination.nextSortBucket,
        sortBucketOffset: pagePagination.nextSortBucketOffset,
      };
    },
    queryFn: async ({ pageParam, signal }) => {
      const query = {
        sourcePath: input.sourcePath,
        targetLocale: input.targetLocale,
        search: debouncedSearch,
        queueFilter: serverQueueFilter,
        queueSort,
        ...(queueFilterQualifier ? { queueFilterQualifier } : {}),
        ...(serializedQueueAdvanced ? { queueAdvanced: serializedQueueAdvanced } : {}),
        limit,
        offset: pageParam.offset,
        ...(input.sourcePaths ? { sourcePaths: input.sourcePaths } : {}),
        ...(input.grouped ? { grouped: "true" as const } : {}),
      };
      if (
        input.goSvcClient &&
        !input.externalResourceId &&
        !providerFallback.current.has(input.projectId)
      ) {
        try {
          const { contentEditorQueue: page } = await input.goSvcClient.cat.queue(
            input.organizationSlug,
            input.projectId,
            query,
            { signal },
          );
          signal.throwIfAborted();
          return page;
        } catch (error) {
          if (!isCatDeferredToApp(error)) throw error;
          providerFallback.current.add(input.projectId);
        }
      }
      return fetchProjectFileContentEditorQueuePage({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        externalResourceId: resolveExternalResourceId(),
        resourceType: input.resourceType,
        targetLocale: input.targetLocale,
        search: debouncedSearch,
        queueFilter: serverQueueFilter,
        queueSort,
        queueFilterQualifier,
        queueAdvanced: serializedQueueAdvanced,
        limit,
        signal,
        offset: pageParam.offset,
        phraseScanPage: pageParam.phraseScanPage,
        phraseScanSkip: pageParam.phraseScanSkip,
        sortBucket: pageParam.sortBucket,
        sortBucketOffset: pageParam.sortBucketOffset,
        sourcePaths: input.sourcePaths,
        intl,
      });
    },
  });

  const fetchDirection = useRef<"next" | "previous">("next");
  useEffect(() => {
    const data = contentEditorQuery.data;
    if (!input.goSvcClient || !data || data.pages[0]?.provider || data.pages.length <= 1) return;
    if (retainedBytes(data.pages) <= CAT_QUEUE_CACHE_BYTES) return;
    queryClient.setQueryData<
      InfiniteData<ProjectFileContentEditorQueuePage, ProjectFileContentEditorQueuePageParam>
    >(baseQueryKey, (current) => {
      if (!current) return current;
      const pages = [...current.pages];
      const pageParams = [...current.pageParams];
      while (pages.length > 1 && retainedBytes(pages) > CAT_QUEUE_CACHE_BYTES) {
        if (fetchDirection.current === "next") {
          pages.shift();
          pageParams.shift();
        } else {
          pages.pop();
          pageParams.pop();
        }
      }
      return { pages, pageParams };
    });
  }, [contentEditorQuery.data, input.goSvcClient, queryClient, baseQueryKey]);

  const contentEditorFile = useMemo(
    () => mergeContentEditorQueuePages(contentEditorQuery.data?.pages ?? []),
    [contentEditorQuery.data?.pages],
  );

  useEffect(() => {
    const discoveredId = contentEditorFile?.provider?.externalResourceId;
    if (discoveredId) {
      discoveredExternalResourceIdRef.current = discoveredId;
    }
  }, [contentEditorFile?.provider?.externalResourceId]);

  const pagination: ContentEditorFilePagination | null = contentEditorFile?.pagination ?? null;

  const loadNextPage = useCallback(() => {
    if (!contentEditorQuery.hasNextPage || contentEditorQuery.isFetching || isSearchPending) {
      return;
    }

    fetchDirection.current = "next";
    void contentEditorQuery.fetchNextPage();
  }, [contentEditorQuery, isSearchPending]);

  const loadPreviousPage = useCallback(() => {
    if (!contentEditorQuery.hasPreviousPage || contentEditorQuery.isFetching || isSearchPending)
      return;
    fetchDirection.current = "previous";
    void contentEditorQuery.fetchPreviousPage();
  }, [contentEditorQuery, isSearchPending]);

  const invalidateQueue = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: baseQueryKey });
  }, [baseQueryKey, queryClient]);

  const queryKey = useMemo(
    () =>
      projectFileCatQueryKey({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        externalResourceId: input.externalResourceId,
        resourceType: input.resourceType,
        targetLocale: input.targetLocale,
        search: debouncedSearch,
        queueFilter: serverQueueFilter,
        queueSort,
        queueFilterQualifier,
        queueAdvanced: serializedQueueAdvanced,
        limit,
        offset: 0,
        sourcePaths: input.sourcePaths,
        grouped: input.grouped,
      }),
    [
      input.grouped,
      debouncedSearch,
      input.organizationSlug,
      input.projectId,
      input.sourcePath,
      input.externalResourceId,
      input.resourceType,
      input.targetLocale,
      input.sourcePaths,
      limit,
      serverQueueFilter,
      queueSort,
      queueFilterQualifier,
      serializedQueueAdvanced,
    ],
  );

  return {
    contentEditorQuery,
    contentEditorFile,
    search,
    setSearch,
    queueFilter,
    setQueueFilter,
    queueSort,
    setQueueSort,
    queueFilterQualifier,
    setQueueFilterQualifier,
    queueAdvanced,
    setQueueAdvanced,
    debouncedSearch,
    isSearchPending,
    pagination,
    loadNextPage,
    loadPreviousPage,
    hasPreviousPage: contentEditorQuery.hasPreviousPage,
    isFetchingPage:
      contentEditorQuery.isFetchingNextPage || contentEditorQuery.isFetchingPreviousPage,
    invalidateQueue,
    queryKey,
    baseQueryKey,
    isFetchingNextPage: contentEditorQuery.isFetchingNextPage,
  };
}
