"use client";

import { useEffect, useMemo } from "react";
import { observer } from "mobx-react-lite";

import type { ProjectFileCatQueueFile } from "@/api/routes/project/project.schema";

import { resolveCatFileIdentity } from "@/components/cat/project-file/project-file-cat-mapper";
import { useCatSegmentComments } from "@/components/cat/project-file/use-cat-segment-comments";
import {
  useCatSegmentTarget,
  useCatSegmentTargets,
} from "@/components/cat/project-file/use-cat-segment-target";

import { useCatWorkspace } from "./cat-workspace-context";

function useCatSegmentLazySync(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  catFile: ProjectFileCatQueueFile | null | undefined;
  enabled: boolean;
  segmentId: string | null;
  syncComments: boolean;
  syncTargetLoading: boolean;
  syncCommentsLoading?: boolean;
}) {
  const store = useCatWorkspace();
  const segmentId = input.segmentId
    ? (store.findSegmentIdByKeyOrId(input.segmentId) ?? input.segmentId)
    : null;

  const { externalResourceId: resolvedExternalResourceId, resourceType: resolvedResourceType } =
    resolveCatFileIdentity({
      externalResourceId: input.externalResourceId,
      resourceType: input.resourceType,
      catFile: input.catFile,
    });

  const segmentTargetQuery = useCatSegmentTarget({
    organizationSlug: input.organizationSlug,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    externalResourceId: resolvedExternalResourceId,
    resourceType: resolvedResourceType,
    targetLocale: input.targetLocale,
    externalStringId: segmentId,
    enabled: input.enabled && Boolean(input.catFile && segmentId),
  });

  const segmentCommentsQuery = useCatSegmentComments({
    organizationSlug: input.organizationSlug,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    externalResourceId: resolvedExternalResourceId,
    resourceType: resolvedResourceType,
    targetLocale: input.targetLocale,
    externalStringId: segmentId,
    enabled: input.enabled && input.syncComments && Boolean(input.catFile && segmentId),
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
  catFile: ProjectFileCatQueueFile | null | undefined;
  enabled: boolean;
  segmentIds: string[];
}) {
  const store = useCatWorkspace();
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
      catFile: input.catFile,
    });

  const targetsEnabled = input.enabled && Boolean(input.catFile) && segmentIds.length > 0;

  const targetQueries = useCatSegmentTargets({
    organizationSlug: input.organizationSlug,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    externalResourceId: resolvedExternalResourceId,
    resourceType: resolvedResourceType,
    targetLocale: input.targetLocale,
    externalStringIds: segmentIds,
    enabled: targetsEnabled,
  });

  useEffect(() => {
    targetQueries.forEach((query, index) => {
      const segmentId = segmentIds[index];
      if (!segmentId || query.data === undefined) {
        return;
      }

      store.applySegmentTarget(segmentId, query.data);
    });
  }, [segmentIds, store, targetQueries]);

  useEffect(() => {
    if (!targetsEnabled) {
      store.setQueueTargetLoadingSegmentIds([]);
      return;
    }

    // Track fetch-in-flight only. Draft text is filtered in `loadingSegmentIds`
    // so typing during a fetch clears the skeleton without needing this effect
    // to re-run on draft changes.
    const loadingIds = segmentIds.filter((_segmentId, index) => {
      const query = targetQueries[index];
      return Boolean(query?.isFetching && query.data === undefined);
    });

    store.setQueueTargetLoadingSegmentIds(loadingIds);
  }, [segmentIds, store, targetQueries, targetsEnabled]);
}

export const CatWorkspaceLazySegmentSync = observer(function CatWorkspaceLazySegmentSync({
  organizationSlug,
  projectId,
  sourcePath,
  targetLocale,
  externalResourceId = null,
  resourceType,
  catFile,
  enabled,
  queueSegmentIds = [],
}: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  catFile: ProjectFileCatQueueFile | null | undefined;
  enabled: boolean;
  queueSegmentIds?: string[];
}) {
  const store = useCatWorkspace();
  const selectedSegmentId = store.selectedSegmentId;
  const previewSegmentId =
    store.ui.hoveredSegmentId && store.ui.hoveredSegmentId !== selectedSegmentId
      ? store.ui.hoveredSegmentId
      : null;
  const isSideBySideView = store.ui.isSideBySideView;

  useCatLoadedQueueTargetsSync({
    organizationSlug,
    projectId,
    sourcePath,
    targetLocale,
    externalResourceId,
    resourceType,
    catFile,
    enabled: enabled && isSideBySideView,
    segmentIds: queueSegmentIds,
  });

  const _selectedSync = useCatSegmentLazySync({
    organizationSlug,
    projectId,
    sourcePath,
    targetLocale,
    externalResourceId,
    resourceType,
    catFile,
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
    catFile,
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
});
