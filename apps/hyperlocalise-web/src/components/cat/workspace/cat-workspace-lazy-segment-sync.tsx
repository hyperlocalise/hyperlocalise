"use client";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";

import type { ProjectFileCatQueueFile } from "@/api/routes/project/project.schema";

import { resolveCatFileIdentity } from "@/components/cat/project-file/project-file-cat-mapper";
import { useCatSegmentComments } from "@/components/cat/project-file/use-cat-segment-comments";
import { useCatSegmentTarget } from "@/components/cat/project-file/use-cat-segment-target";

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

export const CatWorkspaceLazySegmentSync = observer(function CatWorkspaceLazySegmentSync({
  organizationSlug,
  projectId,
  sourcePath,
  targetLocale,
  externalResourceId = null,
  resourceType,
  catFile,
  enabled,
}: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  catFile: ProjectFileCatQueueFile | null | undefined;
  enabled: boolean;
}) {
  const store = useCatWorkspace();
  const selectedSegmentId = store.selectedSegmentId;
  const previewSegmentId =
    store.ui.hoveredSegmentId && store.ui.hoveredSegmentId !== selectedSegmentId
      ? store.ui.hoveredSegmentId
      : null;

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
