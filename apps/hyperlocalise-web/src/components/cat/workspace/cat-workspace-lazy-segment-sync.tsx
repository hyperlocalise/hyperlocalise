"use client";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";

import type { ProjectFileCatQueueFile } from "@/api/routes/project/project.schema";

import { resolveCatFileIdentity } from "@/components/cat/project-file/project-file-cat-mapper";
import { useCatSegmentComments } from "@/components/cat/project-file/use-cat-segment-comments";
import { useCatSegmentTarget } from "@/components/cat/project-file/use-cat-segment-target";

import { useCatWorkspaceStore } from "./store/cat-workspace-store-context";

export const CatWorkspaceLazySegmentSync = observer(function CatWorkspaceLazySegmentSync({
  organizationSlug,
  projectId,
  sourcePath,
  targetLocale,
  externalResourceId = null,
  resourceType,
  repositoryFullName = null,
  catFile,
  enabled,
}: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  repositoryFullName?: string | null;
  catFile: ProjectFileCatQueueFile | null | undefined;
  enabled: boolean;
}) {
  const store = useCatWorkspaceStore();
  const segmentId =
    store.findSegmentIdByKeyOrId(store.selectedSegmentId) ?? store.selectedSegmentId;

  const { externalResourceId: resolvedExternalResourceId, resourceType: resolvedResourceType } =
    resolveCatFileIdentity({
      externalResourceId,
      resourceType,
      catFile,
    });

  const segmentTargetQuery = useCatSegmentTarget({
    organizationSlug,
    projectId,
    sourcePath,
    externalResourceId: resolvedExternalResourceId,
    resourceType: resolvedResourceType,
    targetLocale,
    externalStringId: segmentId || null,
    repositoryFullName,
    enabled: enabled && Boolean(catFile && segmentId),
  });

  const segmentCommentsQuery = useCatSegmentComments({
    organizationSlug,
    projectId,
    sourcePath,
    externalResourceId: resolvedExternalResourceId,
    resourceType: resolvedResourceType,
    targetLocale,
    externalStringId: segmentId || null,
    enabled: enabled && Boolean(catFile && segmentId),
  });

  useEffect(() => {
    if (!segmentId || segmentTargetQuery.data === undefined) {
      return;
    }

    store.applySegmentTarget(segmentId, segmentTargetQuery.data);
  }, [segmentId, segmentTargetQuery.data, store]);

  useEffect(() => {
    if (!segmentId || !segmentCommentsQuery.data) {
      return;
    }

    store.applySegmentComments(segmentId, segmentCommentsQuery.data);
  }, [segmentId, segmentCommentsQuery.data, store]);

  useEffect(() => {
    store.setCommentsLoading(
      Boolean(segmentId) && segmentCommentsQuery.isFetching && !segmentCommentsQuery.data,
    );
  }, [segmentCommentsQuery.data, segmentCommentsQuery.isFetching, segmentId, store]);

  useEffect(() => {
    const isLoading =
      Boolean(segmentId) &&
      segmentTargetQuery.isFetching &&
      segmentTargetQuery.data === undefined &&
      !store.drafts.get(segmentId)?.targetText.trim();

    store.setSegmentTargetLoading(isLoading);
  }, [segmentId, segmentTargetQuery.data, segmentTargetQuery.isFetching, store]);

  return null;
});
