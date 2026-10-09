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
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { resolveContentEditorQueueEmptyCopy } from "./content-editor-queue-empty-copy";
import { ContentEditorQueueSkeletonList } from "./content-editor-queue-skeleton-list";
import { ContentEditorQueueVirtualList } from "./content-editor-queue-virtual-list";
import type { ContentEditorQueueFilter } from "./content-editor-queue-filter";
import {
  contentEditorQueuePanelMessages,
  contentEditorWorkspaceMessages,
} from "@/components/content-editor/shared/content-editor.messages";
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";
import type { SourceFileIngestState } from "@/lib/projects/files/source-file-ingest-state";
import { isSourceFileIngestInProgress } from "@/lib/projects/files/source-file-ingest-state";

export type ContentEditorQueuePagination = {
  offset: number;
  limit: number;
  returnedCount: number;
  totalCount: number;
  hasMore: boolean;
};

export function ContentEditorQueuePanel({
  segments,
  selectedSegmentId,
  dirtySegmentIds,
  onSelectSegment,
  search = "",
  queueFilter = "all",
  checkedSegmentIds,
  onToggleSegmentChecked,
  showSelection = false,
  isFetchingPage = false,
  isQueueLoading = false,
  pagination = null,
  hasMoreQueue = false,
  onLoadMoreQueue,
  ingestState,
  ingestError,
}: {
  segments: ContentEditorSegment[];
  selectedSegmentId: string;
  dirtySegmentIds?: ReadonlySet<string>;
  onSelectSegment: (segmentId: string) => void;
  search?: string;
  queueFilter?: ContentEditorQueueFilter;
  checkedSegmentIds?: ReadonlySet<string>;
  onToggleSegmentChecked?: (segmentId: string, checked: boolean) => void;
  showSelection?: boolean;
  isFetchingPage?: boolean;
  isQueueLoading?: boolean;
  pagination?: ContentEditorQueuePagination | null;
  hasMoreQueue?: boolean;
  onLoadMoreQueue?: () => void;
  ingestState?: SourceFileIngestState | null;
  ingestError?: string | null;
}) {
  const loadedCount = segments.length;
  const hasActiveFilter = queueFilter !== "all";
  const hasSearch = search.trim().length > 0;
  const emptyCopy = resolveContentEditorQueueEmptyCopy({
    hasSearch,
    hasActiveFilter,
    ingestState,
    ingestError,
  });
  const ingestInProgress = isSourceFileIngestInProgress(ingestState);
  const showExtractingSpinner =
    segments.length === 0 && !hasSearch && !hasActiveFilter && ingestInProgress;
  const showIngestBanner =
    ingestInProgress && segments.length > 0 && !hasSearch && !hasActiveFilter;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background lg:border-r lg:border-border">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          <FormattedMessage {...contentEditorQueuePanelMessages.queueTitle} />
        </h2>
      </div>

      {isQueueLoading ? (
        <ContentEditorQueueSkeletonList rowCount={pagination?.limit ?? 8} />
      ) : segments.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-4 pb-3 text-sm text-muted-foreground">
          {showExtractingSpinner ? <Spinner /> : null}
          <FormattedMessage {...emptyCopy.message} values={emptyCopy.values} />
        </div>
      ) : (
        <>
          {showIngestBanner ? (
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm text-muted-foreground">
              <Spinner className="size-3.5" />
              <FormattedMessage {...contentEditorWorkspaceMessages.extractingSegments} />
            </div>
          ) : null}
          <ContentEditorQueueVirtualList
            segments={segments}
            selectedSegmentId={selectedSegmentId}
            dirtySegmentIds={dirtySegmentIds}
            checkedSegmentIds={checkedSegmentIds}
            showSelection={showSelection}
            onToggleSegmentChecked={onToggleSegmentChecked}
            onSelectSegment={onSelectSegment}
            hasMore={hasMoreQueue}
            isLoadingMore={isFetchingPage}
            onNearEnd={onLoadMoreQueue}
          />
        </>
      )}

      {pagination ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            <FormattedMessage
              {...contentEditorQueuePanelMessages.paginationSummary}
              values={{
                count: loadedCount,
                more: hasMoreQueue ? "+" : "",
              }}
            />
          </p>
          {hasMoreQueue && onLoadMoreQueue ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={onLoadMoreQueue}
              disabled={isFetchingPage}
            >
              {isFetchingPage ? <Spinner className="size-3.5" /> : null}
              <FormattedMessage {...contentEditorQueuePanelMessages.loadMore} />
            </Button>
          ) : isFetchingPage ? (
            <Spinner className="size-3.5" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
