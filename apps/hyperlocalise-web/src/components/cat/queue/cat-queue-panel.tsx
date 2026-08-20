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

import { CatQueueSkeletonList } from "./cat-queue-skeleton-list";
import { CatQueueVirtualList } from "./cat-queue-virtual-list";
import type { CatQueueFilter } from "./cat-queue-filter";
import { catQueuePanelMessages, catWorkspaceMessages } from "@/components/cat/shared/cat.messages";
import type { CatSegment } from "@/components/cat/shared/types";

export type CatQueuePagination = {
  offset: number;
  limit: number;
  returnedCount: number;
  totalCount: number;
  hasMore: boolean;
};

export function CatQueuePanel({
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
}: {
  segments: CatSegment[];
  selectedSegmentId: string;
  dirtySegmentIds?: ReadonlySet<string>;
  onSelectSegment: (segmentId: string) => void;
  search?: string;
  queueFilter?: CatQueueFilter;
  checkedSegmentIds?: ReadonlySet<string>;
  onToggleSegmentChecked?: (segmentId: string, checked: boolean) => void;
  showSelection?: boolean;
  isFetchingPage?: boolean;
  isQueueLoading?: boolean;
  pagination?: CatQueuePagination | null;
  hasMoreQueue?: boolean;
  onLoadMoreQueue?: () => void;
}) {
  const loadedCount = segments.length;
  const hasActiveFilter = queueFilter !== "all";
  const hasSearch = search.trim().length > 0;
  const emptyMessage = hasSearch
    ? catQueuePanelMessages.emptySearchResults
    : hasActiveFilter
      ? catQueuePanelMessages.emptyFilterResults
      : catWorkspaceMessages.emptyQueue;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background lg:border-r lg:border-border">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          <FormattedMessage {...catQueuePanelMessages.queueTitle} />
        </h2>
      </div>

      {isQueueLoading ? (
        <CatQueueSkeletonList rowCount={pagination?.limit ?? 8} />
      ) : segments.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-3 text-sm text-muted-foreground">
          <FormattedMessage {...emptyMessage} />
        </div>
      ) : (
        <CatQueueVirtualList
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
      )}

      {pagination ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            <FormattedMessage
              {...catQueuePanelMessages.paginationSummary}
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
              <FormattedMessage {...catQueuePanelMessages.loadMore} />
            </Button>
          ) : isFetchingPage ? (
            <Spinner className="size-3.5" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
