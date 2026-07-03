"use client";

import { FilterIcon, MoreHorizontalCircle01Icon, SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/primitives/cn";

import { CatQueueSkeletonList } from "./cat-queue-skeleton-list";
import { CatQueueVirtualList } from "./cat-queue-virtual-list";
import { catQueueFilterValues, type CatQueueFilter } from "./cat-queue-filter";
import { catQueuePanelMessages } from "./cat.messages";
import type { CatSegment } from "./types";

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
  isQueueLoading?: boolean;
  pagination?: CatQueuePagination | null;
  hasMoreQueue?: boolean;
  onLoadMoreQueue?: () => void;
}) {
  const intl = useIntl();
  const loadedCount = segments.length;
  const selectedCount = checkedSegmentIds?.size ?? 0;
  const hasBulkActions = Boolean(onBulkApprove || onBulkSkip);
  const hasActiveFilter = queueFilter !== "all";
  const emptyMessage =
    hasActiveFilter && !search.trim()
      ? catQueuePanelMessages.emptyFilterResults
      : catQueuePanelMessages.emptySearchResults;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background lg:border-r lg:border-foreground/8">
      <div className="shrink-0 space-y-3 border-b border-foreground/8 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            <FormattedMessage {...catQueuePanelMessages.queueTitle} />
          </h2>
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
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>
                      <FormattedMessage {...catQueuePanelMessages.filterQueueAria} />
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={queueFilter}
                      onValueChange={(value) => onQueueFilterChange(value as CatQueueFilter)}
                    >
                      {availableQueueFilters.map((filterValue) => (
                        <DropdownMenuRadioItem key={filterValue} value={filterValue}>
                          <FormattedMessage {...queueFilterMessageByValue[filterValue]} />
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
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
                  <DropdownMenuGroup>
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
                    {onSelectAllVisible ? (
                      <DropdownMenuItem
                        onClick={onSelectAllVisible}
                        disabled={segments.length === 0}
                      >
                        <FormattedMessage {...catQueuePanelMessages.bulkSelectAll} />
                      </DropdownMenuItem>
                    ) : null}
                    {onClearChecked ? (
                      <DropdownMenuItem onClick={onClearChecked} disabled={selectedCount === 0}>
                        <FormattedMessage {...catQueuePanelMessages.bulkClearSelection} />
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
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
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
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
          onToggleSegmentChecked={onToggleSegmentChecked}
          onSelectSegment={onSelectSegment}
          hasMore={hasMoreQueue}
          isLoadingMore={isFetchingPage}
          onNearEnd={onLoadMoreQueue}
        />
      )}

      {pagination ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-foreground/8 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            <FormattedMessage
              {...catQueuePanelMessages.paginationSummary}
              values={{
                count: loadedCount,
                more: hasMoreQueue ? "+" : "",
              }}
            />
          </p>
          {isFetchingPage ? <Spinner className="size-3.5" /> : null}
        </div>
      ) : null}
    </div>
  );
}
