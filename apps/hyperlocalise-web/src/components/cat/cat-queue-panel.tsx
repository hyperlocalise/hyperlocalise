"use client";

import { FilterIcon, MoreHorizontalCircle01Icon, SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/primitives/cn";

import { CatQueueVirtualList } from "./cat-queue-virtual-list";
import { catQueueFilterValues, type CatQueueFilter } from "./cat-queue-filter";
import { catQueuePanelMessages } from "./cat.messages";
import type { CatQueueSummary, CatSegment } from "./types";

export type CatQueuePagination = {
  offset: number;
  limit: number;
  returnedCount: number;
  totalCount: number;
  hasMore: boolean;
};

const queueFilterMessageByValue: Record<
  CatQueueFilter,
  (typeof catQueuePanelMessages)[keyof typeof catQueuePanelMessages]
> = {
  all: catQueuePanelMessages.filterAll,
  untranslated: catQueuePanelMessages.filterUntranslated,
  needs_review: catQueuePanelMessages.filterNeedsReview,
  reviewed: catQueuePanelMessages.filterReviewed,
  has_issues: catQueuePanelMessages.filterHasIssues,
  skipped: catQueuePanelMessages.filterSkipped,
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
  queueFilter = "all",
  onQueueFilterChange,
  availableQueueFilters = catQueueFilterValues,
  checkedSegmentIds,
  onToggleSegmentChecked,
  onSelectAllVisible,
  onClearChecked,
  onBulkApprove,
  onBulkSkip,
  isBulkActionPending = false,
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
  queueFilter?: CatQueueFilter;
  onQueueFilterChange?: (filter: CatQueueFilter) => void;
  availableQueueFilters?: CatQueueFilter[];
  checkedSegmentIds?: ReadonlySet<string>;
  onToggleSegmentChecked?: (segmentId: string, checked: boolean) => void;
  onSelectAllVisible?: () => void;
  onClearChecked?: () => void;
  onBulkApprove?: () => void;
  onBulkSkip?: () => void;
  isBulkActionPending?: boolean;
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
  const selectedCount = checkedSegmentIds?.size ?? 0;
  const hasBulkActions = Boolean(onBulkApprove || onBulkSkip);
  const hasActiveFilter = queueFilter !== "all";
  const emptyMessage =
    hasActiveFilter && !search.trim()
      ? catQueuePanelMessages.emptyFilterResults
      : catQueuePanelMessages.emptySearchResults;

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

        {onQueueFilterChange || hasBulkActions ? (
          <div className="flex items-center justify-between gap-2">
            {onQueueFilterChange ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 gap-1.5 font-normal",
                        hasActiveFilter && "border-grove-400/40",
                      )}
                      aria-label={intl.formatMessage(catQueuePanelMessages.filterQueueAria)}
                    />
                  }
                >
                  <HugeiconsIcon icon={FilterIcon} className="size-3.5" />
                  <span className="text-xs">
                    <FormattedMessage {...queueFilterMessageByValue[queueFilter]} />
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel>
                    <FormattedMessage {...catQueuePanelMessages.filterQueueAria} />
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {availableQueueFilters.map((filterValue) => (
                    <DropdownMenuCheckboxItem
                      key={filterValue}
                      checked={queueFilter === filterValue}
                      onCheckedChange={() => onQueueFilterChange(filterValue)}
                    >
                      <FormattedMessage {...queueFilterMessageByValue[filterValue]} />
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span />
            )}

            {hasBulkActions ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="size-8"
                      aria-label={intl.formatMessage(catQueuePanelMessages.queueActionsAria)}
                      disabled={isBulkActionPending}
                    />
                  }
                >
                  {isBulkActionPending ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <HugeiconsIcon icon={MoreHorizontalCircle01Icon} className="size-4" />
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>
                    {selectedCount > 0 ? (
                      <FormattedMessage
                        {...catQueuePanelMessages.bulkSelectionSummary}
                        values={{ count: selectedCount }}
                      />
                    ) : (
                      <FormattedMessage {...catQueuePanelMessages.queueActionsAria} />
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {onSelectAllVisible ? (
                    <DropdownMenuItem onClick={onSelectAllVisible} disabled={segments.length === 0}>
                      <FormattedMessage {...catQueuePanelMessages.bulkSelectAll} />
                    </DropdownMenuItem>
                  ) : null}
                  {onClearChecked ? (
                    <DropdownMenuItem onClick={onClearChecked} disabled={selectedCount === 0}>
                      <FormattedMessage {...catQueuePanelMessages.bulkClearSelection} />
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  {onBulkApprove ? (
                    <DropdownMenuItem onClick={onBulkApprove} disabled={selectedCount === 0}>
                      <FormattedMessage {...catQueuePanelMessages.bulkApprove} />
                    </DropdownMenuItem>
                  ) : null}
                  {onBulkSkip ? (
                    <DropdownMenuItem onClick={onBulkSkip} disabled={selectedCount === 0}>
                      <FormattedMessage {...catQueuePanelMessages.bulkSkip} />
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="px-4 py-3">
        <Progress value={progressValue} className="h-1.5" />
      </div>

      {segments.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-3 text-sm text-muted-foreground">
          <FormattedMessage {...emptyMessage} />
        </div>
      ) : (
        <CatQueueVirtualList
          segments={segments}
          selectedSegmentId={selectedSegmentId}
          dirtySegmentIds={dirtySegmentIds}
          checkedSegmentIds={checkedSegmentIds}
          onToggleSegmentChecked={onToggleSegmentChecked}
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
