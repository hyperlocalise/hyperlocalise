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
import { useLayoutEffect, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { reaction } from "mobx";
import { useNativeTargetLoader } from "../project-file/content-editor-native-target-context";
import { projectFileCatSegmentTargetQueryKey } from "../project-file/use-content-editor-segment-target";
import type { ProjectFileContentEditorTranslation } from "@/api/routes/project/project.schema";
import { observer } from "mobx-react-lite";

import type { ProjectFileContentEditorQueueFile } from "@/api/routes/project/project.schema";

import { resolveCatFileIdentity } from "@/components/content-editor/project-file/project-file-content-editor-mapper";
import { useContentEditorSegmentComments } from "@/components/content-editor/project-file/use-content-editor-segment-comments";
import {
  useContentEditorSegmentTarget,
  useContentEditorSegmentTargets,
} from "@/components/content-editor/project-file/use-content-editor-segment-target";

import { useContentEditorWorkspace } from "./content-editor-workspace-context";
import { isSegmentTargetQuerySettledWithoutData } from "./content-editor-workspace-segment-target-query-status";

function useCatSegmentLazySync(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  contentEditorFile: ProjectFileContentEditorQueueFile | null | undefined;
  enabled: boolean;
  segmentId: string | null;
  syncComments: boolean;
  syncTargetLoading: boolean;
  syncCommentsLoading?: boolean;
}) {
  const store = useContentEditorWorkspace();
  const segmentId = input.segmentId
    ? (store.findSegmentIdByKeyOrId(input.segmentId) ?? input.segmentId)
    : null;
  const hasContentEditorFile = Boolean(input.contentEditorFile);

  const queueSegment = segmentId
    ? input.contentEditorFile?.segments.find((segment) => segment.externalStringId === segmentId)
    : null;

  const { externalResourceId: resolvedExternalResourceId, resourceType: resolvedResourceType } =
    resolveCatFileIdentity({
      externalResourceId: queueSegment?.externalResourceId ?? input.externalResourceId,
      resourceType: queueSegment?.resourceType ?? input.resourceType,
      contentEditorFile: input.contentEditorFile,
    });

  const resolvedSourcePath = queueSegment?.sourcePath?.trim() || input.sourcePath;

  const segmentTargetQuery = useContentEditorSegmentTarget({
    organizationSlug: input.organizationSlug,
    projectId: input.projectId,
    sourcePath: resolvedSourcePath,
    externalResourceId: resolvedExternalResourceId,
    resourceType: resolvedResourceType,
    targetLocale: input.targetLocale,
    externalStringId: segmentId,
    enabled: input.enabled && Boolean(input.contentEditorFile && segmentId),
  });

  const segmentCommentsQuery = useContentEditorSegmentComments({
    organizationSlug: input.organizationSlug,
    projectId: input.projectId,
    sourcePath: resolvedSourcePath,
    externalResourceId: resolvedExternalResourceId,
    resourceType: resolvedResourceType,
    targetLocale: input.targetLocale,
    externalStringId: segmentId,
    enabled: input.enabled && input.syncComments && Boolean(input.contentEditorFile && segmentId),
  });

  useEffect(() => {
    if (!segmentId || segmentTargetQuery.data === undefined) {
      return;
    }

    store.applySegmentTarget(segmentId, segmentTargetQuery.data);
  }, [segmentId, segmentTargetQuery.data, store]);

  useEffect(() => {
    if (!segmentId || !segmentCommentsQuery.data || !input.syncComments) {
      return;
    }

    store.applySegmentComments(segmentId, segmentCommentsQuery.data);
  }, [input.syncComments, segmentCommentsQuery.data, segmentId, store]);

  useEffect(() => {
    if (!input.syncCommentsLoading || !segmentId) {
      return;
    }

    store.setCommentsLoading(
      segmentCommentsQuery.isFetching && !segmentCommentsQuery.data,
      segmentId,
    );
  }, [
    input.syncCommentsLoading,
    segmentCommentsQuery.data,
    segmentCommentsQuery.isFetching,
    segmentId,
    store,
  ]);

  useEffect(() => {
    if (!input.syncTargetLoading || !segmentId) {
      return;
    }

    const queryEnabled = input.enabled && hasContentEditorFile;
    const isLoading =
      queryEnabled &&
      segmentTargetQuery.isFetching &&
      segmentTargetQuery.data === undefined &&
      !(segmentId && store.drafts.get(segmentId)?.targetText.trim());

    store.setSegmentTargetLoading(isLoading, segmentId);
    if (isLoading) {
      store.clearSegmentTargetLoadFailed(segmentId);
    } else if (queryEnabled && isSegmentTargetQuerySettledWithoutData(segmentTargetQuery)) {
      store.markSegmentTargetLoadFailed(segmentId);
    }
  }, [
    hasContentEditorFile,
    input.enabled,
    input.syncTargetLoading,
    segmentId,
    segmentTargetQuery.data,
    segmentTargetQuery.fetchStatus,
    segmentTargetQuery.isError,
    segmentTargetQuery.isFetching,
    store,
  ]);

  return {
    segmentId,
    isTargetLoading:
      Boolean(segmentId) &&
      segmentTargetQuery.isFetching &&
      segmentTargetQuery.data === undefined &&
      !(segmentId && store.drafts.get(segmentId)?.targetText.trim()),
    isCommentsFetching: segmentCommentsQuery.isFetching,
    comments: segmentId ? store.segmentComments.get(segmentId) : undefined,
  };
}

function useCatLoadedQueueTargetsSync(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  contentEditorFile: ProjectFileContentEditorQueueFile | null | undefined;
  enabled: boolean;
  segmentIds: string[];
}) {
  const store = useContentEditorWorkspace();
  const segmentIds = useMemo(
    () =>
      Array.from(
        new Set(
          input.segmentIds
            .map((segmentId) => store.findSegmentIdByKeyOrId(segmentId) ?? segmentId)
            .filter((segmentId) => segmentId.trim().length > 0),
        ),
      ),
    [input.segmentIds, store],
  );

  const { externalResourceId: resolvedExternalResourceId, resourceType: resolvedResourceType } =
    resolveCatFileIdentity({
      externalResourceId: input.externalResourceId,
      resourceType: input.resourceType,
      contentEditorFile: input.contentEditorFile,
    });

  const targetsEnabled = input.enabled && Boolean(input.contentEditorFile) && segmentIds.length > 0;

  const targetSegments = useMemo(
    () =>
      segmentIds.map((externalStringId) => {
        const queueSegment = input.contentEditorFile?.segments.find(
          (segment) => segment.externalStringId === externalStringId,
        );
        return {
          externalStringId,
          sourcePath: queueSegment?.sourcePath?.trim() || input.sourcePath,
          externalResourceId: queueSegment?.externalResourceId ?? resolvedExternalResourceId,
          resourceType: queueSegment?.resourceType ?? resolvedResourceType,
        };
      }),
    [
      input.contentEditorFile?.segments,
      input.sourcePath,
      resolvedExternalResourceId,
      resolvedResourceType,
      segmentIds,
    ],
  );

  const targetQueries = useContentEditorSegmentTargets({
    organizationSlug: input.organizationSlug,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    externalResourceId: resolvedExternalResourceId,
    resourceType: resolvedResourceType,
    targetLocale: input.targetLocale,
    segments: targetSegments,
    enabled: targetsEnabled,
  });

  // useQueries() returns a new array every render. Depend on result fingerprints
  // instead so applying targets / loading ids does not form a MobX update loop.
  const targetQueriesRef = useRef(targetQueries);
  targetQueriesRef.current = targetQueries;
  const targetDataSyncKey = targetQueries
    .map((query) => `${query.dataUpdatedAt}:${query.status}`)
    .join("|");
  const targetLoadingSyncKey = targetQueries
    .map(
      (query) =>
        `${query.isFetching}:${query.data === undefined}:${query.status}:${query.fetchStatus}`,
    )
    .join("|");

  useEffect(() => {
    targetQueriesRef.current.forEach((query, index) => {
      const segmentId = segmentIds[index];
      if (!segmentId || query.data === undefined) {
        return;
      }

      store.applySegmentTarget(segmentId, query.data);
    });
  }, [segmentIds, store, targetDataSyncKey]);

  useEffect(() => {
    if (!targetsEnabled) {
      store.setQueueTargetLoadingSegmentIds([]);
      return;
    }

    // Track fetch-in-flight only. Draft text is filtered in `loadingSegmentIds`
    // so typing during a fetch clears the skeleton without needing this effect
    // to re-run on draft changes.
    const loadingIds: string[] = [];
    const failedIds: string[] = [];
    segmentIds.forEach((segmentId, index) => {
      const query = targetQueriesRef.current[index];
      if (!query) {
        return;
      }

      if (query.isFetching && query.data === undefined) {
        loadingIds.push(segmentId);
        return;
      }

      if (isSegmentTargetQuerySettledWithoutData(query)) {
        failedIds.push(segmentId);
      }
    });

    store.setQueueTargetLoadingSegmentIds(loadingIds);
    for (const segmentId of failedIds) {
      store.markSegmentTargetLoadFailed(segmentId);
    }
  }, [segmentIds, store, targetLoadingSyncKey, targetsEnabled]);
}

export const ContentEditorWorkspaceLazySegmentSync = observer(
  function ContentEditorWorkspaceLazySegmentSync({
    organizationSlug,
    projectId,
    sourcePath,
    targetLocale,
    externalResourceId = null,
    resourceType,
    contentEditorFile,
    enabled,
  }: {
    organizationSlug: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
    externalResourceId?: string | null;
    resourceType?: "file" | "key";
    contentEditorFile: ProjectFileContentEditorQueueFile | null | undefined;
    enabled: boolean;
  }) {
    const store = useContentEditorWorkspace();
    const nativeLoader = useNativeTargetLoader();
    const queryClient = useQueryClient();
    useLayoutEffect(() => {
      if (!nativeLoader) return;
      store.serverTargetLookup = (externalStringId) => {
        const segment = store.segmentMeta.get(externalStringId);
        return queryClient.getQueryData<ProjectFileContentEditorTranslation | null>(
          projectFileCatSegmentTargetQueryKey({
            organizationSlug,
            projectId,
            sourcePath: segment?.sourcePath || sourcePath,
            targetLocale,
            externalStringId,
            externalResourceId,
            resourceType,
          }),
        );
      };
      const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        const key = event.query.queryKey;
        if (
          key[0] !== "project-file-content-editor-segment-target" ||
          key[1] !== organizationSlug ||
          key[2] !== projectId ||
          key[6] !== targetLocale
        )
          return;
        const id = String(key[7]);
        if (
          event.type === "updated" &&
          event.query.state.data !== undefined &&
          store.segmentMeta.has(id)
        ) {
          store.applySegmentTarget(
            id,
            event.query.state.data as ProjectFileContentEditorTranslation | null,
          );
        }
      });
      const dispose = reaction(
        () => [store.pendingWrites.size, store.dirtySegmentIds.size],
        () => store.releaseCleanDrafts(),
      );
      return () => {
        unsubscribe();
        dispose();
        store.serverTargetLookup = undefined;
      };
    }, [
      nativeLoader,
      queryClient,
      store,
      organizationSlug,
      projectId,
      sourcePath,
      targetLocale,
      externalResourceId,
      resourceType,
    ]);
    const selectedSegmentId = store.selectedSegmentId;
    const isSideBySideView = store.ui.isSideBySideView;
    const loadSideBySideSegmentIds = store.ui.loadSideBySideSegmentIds;

    const adjacentSegmentIds = useMemo(() => {
      const segments = contentEditorFile?.segments ?? [];
      const index = segments.findIndex((segment) => segment.externalStringId === selectedSegmentId);
      return index < 0
        ? []
        : segments
            .slice(Math.max(0, index - 1), index + 3)
            .map((segment) => segment.externalStringId);
    }, [contentEditorFile, selectedSegmentId]);

    useCatLoadedQueueTargetsSync({
      organizationSlug,
      projectId,
      sourcePath,
      targetLocale,
      externalResourceId,
      resourceType,
      contentEditorFile,
      enabled: enabled && store.ui.viewMode !== "multilingual",
      segmentIds: isSideBySideView ? loadSideBySideSegmentIds : adjacentSegmentIds,
    });

    useCatSegmentLazySync({
      organizationSlug,
      projectId,
      sourcePath,
      targetLocale,
      externalResourceId,
      resourceType,
      contentEditorFile,
      enabled: enabled && store.ui.viewMode !== "multilingual",
      segmentId: selectedSegmentId || null,
      syncComments: true,
      syncTargetLoading: true,
      syncCommentsLoading: true,
    });

    return null;
  },
);
