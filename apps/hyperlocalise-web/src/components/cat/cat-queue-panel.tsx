"use client";

import { SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";

import { CatQueueVirtualList } from "./cat-queue-virtual-list";
import { catQueuePanelMessages } from "./cat.messages";
import type { CatQueueSummary, CatSegment } from "./types";

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
  summary,
  dirtySegmentIds,
  onSelectSegment,
  search = "",
  onSearchChange,
  isSearching = false,
  isFetchingPage = false,
  pagination = null,
  onPreviousPage,
  onNextPage,
  onNearEnd,
}: {
  segments: CatSegment[];
  selectedSegmentId: string;
  summary: CatQueueSummary;
  dirtySegmentIds?: ReadonlySet<string>;
  onSelectSegment: (segmentId: string) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  isSearching?: boolean;
  isFetchingPage?: boolean;
  pagination?: CatQueuePagination | null;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  onNearEnd?: () => void;
}) {
  const intl = useIntl();
  const progressValue =
    summary.total > 0 ? Math.round((summary.reviewed / summary.total) * 100) : 0;
  const rangeStart = pagination ? pagination.offset + 1 : 1;
  const rangeEnd = pagination ? pagination.offset + pagination.returnedCount : segments.length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background lg:border-r lg:border-foreground/8">
      <div className="space-y-3 border-b border-foreground/8 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            <FormattedMessage {...catQueuePanelMessages.queueTitle} />
          </h2>
          <p className="text-xs text-muted-foreground">
            <FormattedMessage
              {...catQueuePanelMessages.queueSummary}
              values={{ total: summary.total, reviewed: summary.reviewed }}
            />
          </p>
        </div>

        {onSearchChange ? (
          <div className="relative">
            <HugeiconsIcon
              icon={SearchIcon}
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={intl.formatMessage(catQueuePanelMessages.searchPlaceholder)}
              aria-label={intl.formatMessage(catQueuePanelMessages.searchAria)}
              className="h-9 pl-9 font-mono text-xs"
            />
            {isSearching ? (
              <Spinner className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2" />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="px-4 py-3">
        <Progress value={progressValue} className="h-1.5" />
      </div>

      {segments.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-3 text-sm text-muted-foreground">
          <FormattedMessage {...catQueuePanelMessages.emptySearchResults} />
        </div>
      ) : (
        <CatQueueVirtualList
          segments={segments}
          selectedSegmentId={selectedSegmentId}
          dirtySegmentIds={dirtySegmentIds}
          onSelectSegment={onSelectSegment}
          onNearEnd={onNearEnd}
        />
      )}

      {pagination ? (
        <div className="flex items-center justify-between gap-2 border-t border-foreground/8 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            <FormattedMessage
              {...catQueuePanelMessages.paginationSummary}
              values={{
                start: rangeStart,
                end: rangeEnd,
                total: pagination.totalCount,
              }}
            />
          </p>
          <div className="flex items-center gap-1">
            {isFetchingPage ? <Spinner className="size-3.5" /> : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagination.offset === 0 || isFetchingPage}
              onClick={onPreviousPage}
            >
              <FormattedMessage {...catQueuePanelMessages.previousPage} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!pagination.hasMore || isFetchingPage}
              onClick={onNextPage}
            >
              <FormattedMessage {...catQueuePanelMessages.nextPage} />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
