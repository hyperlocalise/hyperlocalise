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
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
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
  canReuseCatQueuePlaceholderData,
  defaultCatPageLimit,
  fetchProjectFileContentEditorQueuePage,
  projectFileCatBaseQueryKey,
  projectFileCatQueryKey,
  type ProjectFileContentEditorQueuePage,
  type ProjectFileContentEditorQueuePageParam,
} from "./project-file-content-editor-api";

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
  pageLimit?: number;
  sourcePaths?: string | null;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(() => input.initialSearch ?? "");
  const [queueFilter, setQueueFilter] = useState<ContentEditorQueueFilter>(
    () => input.initialQueueFilter ?? "all",
  );
  const [queueSort, setQueueSort] = useState<ContentEditorQueueSort>(
    () => input.initialQueueSort ?? "file_order",
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
        queueSort,
        limit,
        sourcePaths: input.sourcePaths,
      }),
    [
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
    queryFn: ({ pageParam }) =>
      fetchProjectFileContentEditorQueuePage({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        externalResourceId: resolveExternalResourceId(),
        resourceType: input.resourceType,
        targetLocale: input.targetLocale,
        search: debouncedSearch,
        queueFilter: serverQueueFilter,
        queueSort,
        limit,
        offset: pageParam.offset,
        phraseScanPage: pageParam.phraseScanPage,
        phraseScanSkip: pageParam.phraseScanSkip,
        sortBucket: pageParam.sortBucket,
        sortBucketOffset: pageParam.sortBucketOffset,
        sourcePaths: input.sourcePaths,
        intl,
      }),
  });

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
    if (
      !contentEditorQuery.hasNextPage ||
      contentEditorQuery.isFetchingNextPage ||
      isSearchPending
    ) {
      return;
    }

    void contentEditorQuery.fetchNextPage();
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
        limit,
        offset: 0,
        sourcePaths: input.sourcePaths,
      }),
    [
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
    debouncedSearch,
    isSearchPending,
    pagination,
    loadNextPage,
    invalidateQueue,
    queryKey,
    baseQueryKey,
    isFetchingNextPage: contentEditorQuery.isFetchingNextPage,
  };
}
