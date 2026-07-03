"use client";

import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  targetLocale: string;
  repositoryFullName?: string | null;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const repositoryFullName = input.repositoryFullName ?? null;
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState<CatQueueFilter>("all");
  const [limit] = useState(defaultCatPageLimit);
  const debouncedSearch = useDebouncedValue(search, 300);
  const isSearchPending = search !== debouncedSearch;
  const serverQueueFilter = toServerQueueFilter(queueFilter);

  const baseQueryKey = useMemo(
    () =>
      projectFileCatBaseQueryKey({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        targetLocale: input.targetLocale,
        repositoryFullName,
        search: debouncedSearch,
        queueFilter: serverQueueFilter,
        limit,
      }),
    [
      debouncedSearch,
      input.organizationSlug,
      input.projectId,
      input.sourcePath,
      input.targetLocale,
      limit,
      repositoryFullName,
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
        targetLocale: input.targetLocale,
        repositoryFullName,
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
        targetLocale: input.targetLocale,
        repositoryFullName,
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
      input.targetLocale,
      limit,
      repositoryFullName,
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
