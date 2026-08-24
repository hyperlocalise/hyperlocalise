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

import type { ProjectFileCatQueueFile } from "@/api/routes/project/project.schema";

import { resolveCatFileIdentity } from "@/components/cat/project-file/project-file-cat-mapper";
import {
  flattenGroupOccurrenceComments,
  representativeTargetFromOccurrences,
  useCatGroupOccurrences,
  useCatGroupOccurrencesList,
} from "@/components/cat/project-file/use-cat-group-occurrences";
import { useCatSegmentComments } from "@/components/cat/project-file/use-cat-segment-comments";
import {
  useCatSegmentTarget,
  useCatSegmentTargets,
} from "@/components/cat/project-file/use-cat-segment-target";
import { isCatQueueGroup } from "@/lib/projects/cat/cat-queue-row";

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

  const queueSegment = segmentId
    ? input.catFile?.segments.find((segment) => segment.externalStringId === segmentId)
    : null;
  const queueGroup = queueSegment && isCatQueueGroup(queueSegment) ? queueSegment : null;

  const { externalResourceId: resolvedExternalResourceId, resourceType: resolvedResourceType } =
    resolveCatFileIdentity({
      externalResourceId: queueSegment?.externalResourceId ?? input.externalResourceId,
      resourceType: queueSegment?.resourceType ?? input.resourceType,
      catFile: input.catFile,
    });

  const resolvedSourcePath = queueSegment?.sourcePath?.trim() || input.sourcePath;
  const segmentSyncEnabled =
    input.enabled && Boolean(input.catFile && segmentId) && queueGroup == null;

  const segmentTargetQuery = useCatSegmentTarget({
    organizationSlug: input.organizationSlug,
    projectId: input.projectId,
    sourcePath: resolvedSourcePath,
    externalResourceId: resolvedExternalResourceId,
    resourceType: resolvedResourceType,
    targetLocale: input.targetLocale,
    externalStringId: segmentId,
    enabled: segmentSyncEnabled,
  });

  const segmentCommentsQuery = useCatSegmentComments({
    organizationSlug: input.organizationSlug,
    projectId: input.projectId,
    sourcePath: resolvedSourcePath,
    externalResourceId: resolvedExternalResourceId,
    resourceType: resolvedResourceType,
    targetLocale: input.targetLocale,
    externalStringId: segmentId,
    enabled: segmentSyncEnabled && input.syncComments,
  });

  const groupOccurrencesQuery = useCatGroupOccurrences({
    organizationSlug: input.organizationSlug,
    projectId: input.projectId,
    targetLocale: input.targetLocale,
    groupId: queueGroup?.groupId ?? null,
    sourceTextHash: queueGroup?.sourceTextHash ?? null,
    enabled: input.enabled && Boolean(input.catFile && queueGroup),
  });

  useEffect(() => {
    if (!segmentId || queueGroup) {
      return;
    }
    if (segmentTargetQuery.data === undefined) {
      return;
    }

    store.applySegmentTarget(segmentId, segmentTargetQuery.data);
  }, [queueGroup, segmentId, segmentTargetQuery.data, store]);

  useEffect(() => {
    if (!segmentId || !queueGroup || groupOccurrencesQuery.data === undefined) {
      return;
    }

    store.applySegmentTarget(segmentId, representativeTargetFromOccurrences(groupOccurrencesQuery.data));
    if (input.syncComments) {
      store.applySegmentComments(segmentId, flattenGroupOccurrenceComments(groupOccurrencesQuery.data));
    }
  }, [groupOccurrencesQuery.data, input.syncComments, queueGroup, segmentId, store]);

  useEffect(() => {
    if (!segmentId || !segmentCommentsQuery.data || !input.syncComments || queueGroup) {
      return;
    }

    store.applySegmentComments(segmentId, segmentCommentsQuery.data);
  }, [input.syncComments, queueGroup, segmentCommentsQuery.data, segmentId, store]);

  useEffect(() => {
    if (!input.syncCommentsLoading || !segmentId) {
      return;
    }

    const isFetching = queueGroup
      ? groupOccurrencesQuery.isFetching && !groupOccurrencesQuery.data
      : segmentCommentsQuery.isFetching && !segmentCommentsQuery.data;
    store.setCommentsLoading(isFetching);
  }, [
    groupOccurrencesQuery.data,
    groupOccurrencesQuery.isFetching,
    input.syncCommentsLoading,
    queueGroup,
    segmentCommentsQuery.data,
    segmentCommentsQuery.isFetching,
    segmentId,
    store,
  ]);

  useEffect(() => {
    if (!input.syncTargetLoading || !segmentId) {
      return;
    }

    const query = queueGroup ? groupOccurrencesQuery : segmentTargetQuery;
    const isLoading =
      query.isFetching &&
      query.data === undefined &&
      !(segmentId && store.drafts.get(segmentId)?.targetText.trim());

    store.setSegmentTargetLoading(isLoading);
  }, [
    groupOccurrencesQuery.data,
    groupOccurrencesQuery.isFetching,
    input.syncTargetLoading,
    queueGroup,
    segmentId,
    segmentTargetQuery.data,
    segmentTargetQuery.isFetching,
    store,
  ]);

  const isTargetFetching = queueGroup
    ? groupOccurrencesQuery.isFetching && groupOccurrencesQuery.data === undefined
    : segmentTargetQuery.isFetching && segmentTargetQuery.data === undefined;

  return {
    segmentId,
    isTargetLoading:
      Boolean(segmentId) &&
      isTargetFetching &&
      !(segmentId && store.drafts.get(segmentId)?.targetText.trim()),
    isCommentsFetching: queueGroup
      ? groupOccurrencesQuery.isFetching
      : segmentCommentsQuery.isFetching,
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

  const targetSegments = useMemo(
    () =>
      segmentIds.flatMap((externalStringId) => {
        const queueSegment = input.catFile?.segments.find(
          (segment) => segment.externalStringId === externalStringId,
        );
        if (queueSegment && isCatQueueGroup(queueSegment)) {
          return [];
        }
        return [
          {
            externalStringId,
            sourcePath: queueSegment?.sourcePath?.trim() || input.sourcePath,
            externalResourceId: queueSegment?.externalResourceId ?? resolvedExternalResourceId,
            resourceType: queueSegment?.resourceType ?? resolvedResourceType,
          },
        ];
      }),
    [
      input.catFile?.segments,
      input.sourcePath,
      resolvedExternalResourceId,
      resolvedResourceType,
      segmentIds,
    ],
  );
  const visibleGroups = useMemo(
    () =>
      segmentIds.flatMap((externalStringId) => {
        const queueSegment = input.catFile?.segments.find(
          (segment) => segment.externalStringId === externalStringId,
        );
        return queueSegment && isCatQueueGroup(queueSegment)
          ? [{ groupId: queueSegment.groupId, sourceTextHash: queueSegment.sourceTextHash }]
          : [];
      }),
    [input.catFile?.segments, segmentIds],
  );

  const targetQueries = useCatSegmentTargets({
    organizationSlug: input.organizationSlug,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    externalResourceId: resolvedExternalResourceId,
    resourceType: resolvedResourceType,
    targetLocale: input.targetLocale,
    segments: targetSegments,
    enabled: targetsEnabled,
  });
  const groupQueries = useCatGroupOccurrencesList({
    organizationSlug: input.organizationSlug,
    projectId: input.projectId,
    targetLocale: input.targetLocale,
    groups: visibleGroups,
    enabled: targetsEnabled,
  });

  // useQueries() returns a new array every render. Depend on result fingerprints
  // instead so applying targets / loading ids does not form a MobX update loop.
  const targetQueriesRef = useRef(targetQueries);
  targetQueriesRef.current = targetQueries;
  const groupQueriesRef = useRef(groupQueries);
  groupQueriesRef.current = groupQueries;
  const targetDataSyncKey = targetQueries
    .map((query) => `${query.dataUpdatedAt}:${query.status}`)
    .join("|");
  const groupDataSyncKey = groupQueries
    .map((query) => `${query.dataUpdatedAt}:${query.status}`)
    .join("|");
  const targetLoadingSyncKey = [
    ...targetQueries.map((query) => `${query.isFetching}:${query.data === undefined}`),
    ...groupQueries.map((query) => `${query.isFetching}:${query.data === undefined}`),
  ].join("|");

  useEffect(() => {
    targetQueriesRef.current.forEach((query, index) => {
      const segmentId = targetSegments[index]?.externalStringId;
      if (!segmentId || query.data === undefined) {
        return;
      }

      store.applySegmentTarget(segmentId, query.data);
    });
  }, [store, targetDataSyncKey, targetSegments]);

  useEffect(() => {
    groupQueriesRef.current.forEach((query, index) => {
      const group = visibleGroups[index];
      if (!group || query.data === undefined) {
        return;
      }

      store.applySegmentTarget(group.groupId, representativeTargetFromOccurrences(query.data));
    });
  }, [groupDataSyncKey, store, visibleGroups]);

  useEffect(() => {
    if (!targetsEnabled) {
      store.setQueueTargetLoadingSegmentIds([]);
      return;
    }

    // Track fetch-in-flight only. Draft text is filtered in `loadingSegmentIds`
    // so typing during a fetch clears the skeleton without needing this effect
    // to re-run on draft changes.
    const loadingSegmentIds = targetSegments
      .filter((_segment, index) => {
        const query = targetQueriesRef.current[index];
        return Boolean(query?.isFetching && query.data === undefined);
      })
      .map((segment) => segment.externalStringId);
    const loadingGroupIds = visibleGroups
      .filter((_group, index) => {
        const query = groupQueriesRef.current[index];
        return Boolean(query?.isFetching && query.data === undefined);
      })
      .map((group) => group.groupId);

    store.setQueueTargetLoadingSegmentIds([...loadingSegmentIds, ...loadingGroupIds]);
  }, [store, targetLoadingSyncKey, targetSegments, targetsEnabled, visibleGroups]);
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
  const isSideBySideView = store.ui.isSideBySideView;
  const visibleSideBySideSegmentIds = store.ui.visibleSideBySideSegmentIds;

  useCatLoadedQueueTargetsSync({
    organizationSlug,
    projectId,
    sourcePath,
    targetLocale,
    externalResourceId,
    resourceType,
    catFile,
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
