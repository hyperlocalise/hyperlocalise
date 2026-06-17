"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ProjectFileCatResponse } from "@/api/routes/project/project.schema";

import {
  defaultCatPageLimit,
  fetchProjectFileCatPage,
  projectFileCatBaseQueryKey,
  projectFileCatQueryKey,
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
  const [offset, setOffset] = useState(0);
  const [limit] = useState(defaultCatPageLimit);
  const debouncedSearch = useDebouncedValue(search, 300);
  const isSearchPending = search !== debouncedSearch;

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, input.sourcePath, input.targetLocale, repositoryFullName]);

  const queryKey = useMemo(
    () =>
      projectFileCatQueryKey({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        targetLocale: input.targetLocale,
        repositoryFullName,
        search: debouncedSearch,
        limit,
        offset,
      }),
    [
      debouncedSearch,
      input.organizationSlug,
      input.projectId,
      input.sourcePath,
      input.targetLocale,
      limit,
      offset,
      repositoryFullName,
    ],
  );

  const catQuery = useQuery({
    queryKey,
    enabled: input.enabled !== false,
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchProjectFileCatPage({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        targetLocale: input.targetLocale,
        repositoryFullName,
        search: debouncedSearch,
        limit,
        offset,
      }),
  });

  const pagination: CatFilePagination | null = catQuery.data?.pagination ?? null;

  const prefetchNextPage = useCallback(() => {
    if (!pagination?.hasMore || isSearchPending) {
      return;
    }

    const nextOffset = offset + limit;
    const nextKey = projectFileCatQueryKey({
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      repositoryFullName,
      search: debouncedSearch,
      limit,
      offset: nextOffset,
    });

    void queryClient.prefetchQuery({
      queryKey: nextKey,
      staleTime: 30_000,
      queryFn: () =>
        fetchProjectFileCatPage({
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
          sourcePath: input.sourcePath,
          targetLocale: input.targetLocale,
          repositoryFullName,
          search: debouncedSearch,
          limit,
          offset: nextOffset,
        }),
    });
  }, [
    debouncedSearch,
    input.organizationSlug,
    input.projectId,
    input.sourcePath,
    input.targetLocale,
    isSearchPending,
    limit,
    offset,
    pagination?.hasMore,
    queryClient,
    repositoryFullName,
  ]);

  useEffect(() => {
    if (catQuery.isSuccess) {
      prefetchNextPage();
    }
  }, [catQuery.isSuccess, catQuery.dataUpdatedAt, prefetchNextPage]);

  const invalidateCurrentPage = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const goToPreviousPage = useCallback(() => {
    setOffset((current) => Math.max(current - limit, 0));
  }, [limit]);

  const goToNextPage = useCallback(() => {
    if (!pagination?.hasMore) {
      return;
    }
    setOffset((current) => current + limit);
  }, [limit, pagination?.hasMore]);

  return {
    catQuery,
    search,
    setSearch,
    offset,
    limit,
    debouncedSearch,
    isSearchPending,
    pagination,
    prefetchNextPage,
    invalidateCurrentPage,
    goToPreviousPage,
    goToNextPage,
    queryKey,
    baseQueryKey: projectFileCatBaseQueryKey({
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      repositoryFullName,
      search: debouncedSearch,
      limit,
    }),
  };
}
