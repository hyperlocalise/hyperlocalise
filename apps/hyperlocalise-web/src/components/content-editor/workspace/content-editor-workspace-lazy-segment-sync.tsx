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
import { useEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react-lite";

import type { ProjectFileContentEditorQueueFile } from "@/api/routes/project/project.schema";

import { resolveCatFileIdentity } from "@/components/content-editor/project-file/project-file-content-editor-mapper";
import { useContentEditorSegmentComments } from "@/components/content-editor/project-file/use-content-editor-segment-comments";
import {
  useContentEditorSegmentTarget,
  useContentEditorSegmentTargets,
} from "@/components/content-editor/project-file/use-content-editor-segment-target";

import { useContentEditorWorkspace } from "./content-editor-workspace-context";

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

    store.setCommentsLoading(segmentCommentsQuery.isFetching && !segmentCommentsQuery.data);
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

    const isLoading =
      segmentTargetQuery.isFetching &&
      segmentTargetQuery.data === undefined &&
      !(segmentId && store.drafts.get(segmentId)?.targetText.trim());

    store.setSegmentTargetLoading(isLoading);
  }, [
    input.syncTargetLoading,
    segmentId,
    segmentTargetQuery.data,
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
    .map((query) => `${query.isFetching}:${query.data === undefined}`)
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
    const loadingIds = segmentIds.filter((_segmentId, index) => {
      const query = targetQueriesRef.current[index];
      return Boolean(query?.isFetching && query.data === undefined);
    });

    store.setQueueTargetLoadingSegmentIds(loadingIds);
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
    const selectedSegmentId = store.selectedSegmentId;
    const previewSegmentId =
      store.ui.hoveredSegmentId && store.ui.hoveredSegmentId !== selectedSegmentId
        ? store.ui.hoveredSegmentId
        : null;
    const isSideBySideView = store.ui.isSideBySideView;
    const visibleSideBySideSegmentIds = store.ui.visibleSideBySideSegmentIds;

    useCatLoadedQueueTargetsSync({
      organizationSlug,
      projectId,
      sourcePath,
      targetLocale,
      externalResourceId,
      resourceType,
      contentEditorFile,
      enabled: enabled && isSideBySideView,
      segmentIds: visibleSideBySideSegmentIds,
    });

    const _selectedSync = useCatSegmentLazySync({
      organizationSlug,
      projectId,
      sourcePath,
      targetLocale,
      externalResourceId,
      resourceType,
      contentEditorFile,
      enabled,
      segmentId: selectedSegmentId || null,
      syncComments: true,
      syncTargetLoading: true,
      syncCommentsLoading: true,
    });

    const previewSync = useCatSegmentLazySync({
      organizationSlug,
      projectId,
      sourcePath,
      targetLocale,
      externalResourceId,
      resourceType,
      contentEditorFile,
      enabled: enabled && Boolean(previewSegmentId),
      segmentId: previewSegmentId,
      syncComments: true,
      syncTargetLoading: false,
      syncCommentsLoading: false,
    });

    useEffect(() => {
      store.ui.setPreviewLoadingState(previewSync.segmentId, {
        isTargetLoading: previewSync.isTargetLoading,
        isCommentsLoading:
          Boolean(previewSync.segmentId) &&
          previewSync.isCommentsFetching &&
          previewSync.comments === undefined,
      });
    }, [
      previewSync.comments,
      previewSync.isCommentsFetching,
      previewSync.isTargetLoading,
      previewSync.segmentId,
      store,
    ]);

    return null;
  },
);
