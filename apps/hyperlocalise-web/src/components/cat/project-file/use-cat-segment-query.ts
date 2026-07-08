"use client";

import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ProjectFileCatQueueFilter } from "@/api/routes/project/project.schema";
import type { ProjectFileCatResponse } from "@/api/routes/project/project.schema";

import { isServerQueueFilter, type CatQueueFilter } from "@/components/cat/queue/cat-queue-filter";
import { mergeCatQueuePages } from "@/components/cat/queue/merge-cat-queue-pages";

import {
  defaultCatPageLimit,
  fetchProjectFileCatQueuePage,
  projectFileCatBaseQueryKey,
  projectFileCatQueryKey,
  type ProjectFileCatQueuePage,
  type ProjectFileCatQueuePageParam,
} from "./project-file-cat-api";

type CatFilePagination = NonNullable<ProjectFileCatResponse["catFile"]["pagination"]>;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

function toServerQueueFilter(filter: CatQueueFilter): ProjectFileCatQueueFilter {
  return isServerQueueFilter(filter) ? filter : "all";
}

export function useCatSegmentQuery(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  enabled?: boolean;
  initialQueueFilter?: CatQueueFilter;
  pageLimit?: number;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState<CatQueueFilter>(
    () => input.initialQueueFilter ?? "all",
  );
  const limit = input.pageLimit ?? defaultCatPageLimit;
  const debouncedSearch = useDebouncedValue(search, 300);
  const isSearchPending = search !== debouncedSearch;
  const serverQueueFilter = toServerQueueFilter(queueFilter);
  const discoveredExternalResourceIdRef = useRef<string | null>(input.externalResourceId ?? null);

  if (input.externalResourceId) {
    discoveredExternalResourceIdRef.current = input.externalResourceId;
  }

  const resolveExternalResourceId = useCallback(() => {
    return input.externalResourceId ?? discoveredExternalResourceIdRef.current;
  }, [input.externalResourceId]);

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
        limit,
      }),
    [
      debouncedSearch,
      input.organizationSlug,
      input.projectId,
      input.sourcePath,
      input.externalResourceId,
      input.resourceType,
      input.targetLocale,
      limit,
      serverQueueFilter,
    ],
  );

  const catQuery = useInfiniteQuery<
    ProjectFileCatQueuePage,
    Error,
    InfiniteData<ProjectFileCatQueuePage, ProjectFileCatQueuePageParam>,
    ReturnType<typeof projectFileCatBaseQueryKey>,
    ProjectFileCatQueuePageParam
  >({
    queryKey: baseQueryKey,
    enabled: input.enabled !== false && Boolean(input.targetLocale) && Boolean(input.sourcePath),
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
      };
    },
    queryFn: ({ pageParam }) =>
      fetchProjectFileCatQueuePage({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        externalResourceId: resolveExternalResourceId(),
        resourceType: input.resourceType,
        targetLocale: input.targetLocale,
        search: debouncedSearch,
        queueFilter: serverQueueFilter,
        limit,
        offset: pageParam.offset,
        phraseScanPage: pageParam.phraseScanPage,
        phraseScanSkip: pageParam.phraseScanSkip,
      }),
  });

  const catFile = useMemo(
    () => mergeCatQueuePages(catQuery.data?.pages ?? []),
    [catQuery.data?.pages],
  );

  useEffect(() => {
    const discoveredId = catFile?.provider?.externalResourceId;
    if (discoveredId) {
      discoveredExternalResourceIdRef.current = discoveredId;
    }
  }, [catFile?.provider?.externalResourceId]);

  const pagination: CatFilePagination | null = catFile?.pagination ?? null;

  const loadNextPage = useCallback(() => {
    if (!catQuery.hasNextPage || catQuery.isFetchingNextPage || isSearchPending) {
      return;
    }

    void catQuery.fetchNextPage();
  }, [catQuery, isSearchPending]);

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
        limit,
        offset: 0,
      }),
    [
      debouncedSearch,
      input.organizationSlug,
      input.projectId,
      input.sourcePath,
      input.externalResourceId,
      input.resourceType,
      input.targetLocale,
      limit,
      serverQueueFilter,
    ],
  );

  return {
    catQuery,
    catFile,
    search,
    setSearch,
    queueFilter,
    setQueueFilter,
    debouncedSearch,
    isSearchPending,
    pagination,
    loadNextPage,
    invalidateQueue,
    queryKey,
    baseQueryKey,
    isFetchingNextPage: catQuery.isFetchingNextPage,
  };
}
