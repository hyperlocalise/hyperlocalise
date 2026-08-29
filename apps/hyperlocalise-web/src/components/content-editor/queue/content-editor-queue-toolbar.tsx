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
import {
  Download01Icon,
  FilterIcon,
  MoreHorizontalCircle01Icon,
  SearchIcon,
  Sorting01Icon,
} from "@hugeicons/core-free-icons";
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

import {
  contentEditorQueueFilterValues,
  contentEditorQueueSortValues,
  type ContentEditorQueueFilter,
  type ContentEditorQueueSort,
} from "./content-editor-queue-filter";
import { contentEditorQueuePanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import { ContentEditorWorkspaceViewSwitcherConnected } from "@/components/content-editor/workspace/content-editor-workspace-view-switcher-connected";

export const queueFilterMessageByValue: Record<
  ContentEditorQueueFilter,
  (typeof contentEditorQueuePanelMessages)[keyof typeof contentEditorQueuePanelMessages]
> = {
  all: contentEditorQueuePanelMessages.filterAll,
  untranslated: contentEditorQueuePanelMessages.filterUntranslated,
  needs_review: contentEditorQueuePanelMessages.filterNeedsReview,
  reviewed: contentEditorQueuePanelMessages.filterReviewed,
  unsaved: contentEditorQueuePanelMessages.filterUnsaved,
  qa_issues: contentEditorQueuePanelMessages.filterQaIssues,
  machine_translated: contentEditorQueuePanelMessages.filterMachineTranslated,
  with_comments: contentEditorQueuePanelMessages.filterWithComments,
  has_issues: contentEditorQueuePanelMessages.filterHasIssues,
  skipped: contentEditorQueuePanelMessages.filterSkipped,
  hidden: contentEditorQueuePanelMessages.filterHidden,
};

export const queueSortMessageByValue: Record<
  ContentEditorQueueSort,
  (typeof contentEditorQueuePanelMessages)[keyof typeof contentEditorQueuePanelMessages]
> = {
  file_order: contentEditorQueuePanelMessages.sortFileOrder,
  untranslated_first: contentEditorQueuePanelMessages.sortUntranslatedFirst,
};

export function ContentEditorQueueToolbar({
  search = "",
  onSearchChange,
  isSearching = false,
  queueFilter = "all",
  onQueueFilterChange,
  availableQueueFilters = contentEditorQueueFilterValues,
  queueSort = "file_order",
  onQueueSortChange,
  availableQueueSorts = contentEditorQueueSortValues,
  selectionMode = false,
  onSelectionModeChange,
  selectedCount = 0,
  visibleCount = 0,
  onSelectAllVisible,
  onClearChecked,
  onBulkApprove,
  onBulkSkip,
  onBulkHide,
  onBulkUnhide,
  onBulkLock,
  onBulkUnlock,
  isBulkActionPending = false,
  isQueueLoading = false,
  onDownloadFilteredView,
  isDownloadingFilteredView = false,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  isSearching?: boolean;
  queueFilter?: ContentEditorQueueFilter;
  onQueueFilterChange?: (filter: ContentEditorQueueFilter) => void;
  availableQueueFilters?: ContentEditorQueueFilter[];
  queueSort?: ContentEditorQueueSort;
  onQueueSortChange?: (sort: ContentEditorQueueSort) => void;
  availableQueueSorts?: ContentEditorQueueSort[];
  selectionMode?: boolean;
  onSelectionModeChange?: (enabled: boolean) => void;
  selectedCount?: number;
  visibleCount?: number;
  onSelectAllVisible?: () => void;
  onClearChecked?: () => void;
  onBulkApprove?: () => void;
  onBulkSkip?: () => void;
  onBulkHide?: () => void;
  onBulkUnhide?: () => void;
  onBulkLock?: () => void;
  onBulkUnlock?: () => void;
  isBulkActionPending?: boolean;
  /**
   * When the queue query is showing placeholder data, or the store has not
   * ingested the current snapshot yet, visible segments may still be from the
   * previous page. Bulk select/mutate must wait until both are ready.
   */
  isQueueLoading?: boolean;
  onDownloadFilteredView?: (format: "csv" | "tmx" | "xlf" | "xliff") => void;
  isDownloadingFilteredView?: boolean;
}) {
  const intl = useIntl();
  const hasBulkActions = Boolean(
    onSelectionModeChange &&
    (onBulkApprove || onBulkSkip || onBulkHide || onBulkUnhide || onBulkLock || onBulkUnlock),
  );
  const hasActiveFilter = queueFilter !== "all";
  const hasActiveSort = queueSort !== "file_order";
  const showSort = Boolean(onQueueSortChange) && availableQueueSorts.includes("untranslated_first");
  // Placeholder reuse or a not-yet-ingested cache hit can keep chrome mounted
  // while the store still holds the previous page — never treat those ids as
  // bulk targets.
  const bulkTargetsReady = !isQueueLoading;
  const selectableVisibleCount = bulkTargetsReady ? visibleCount : 0;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
      {onSearchChange ? (
        <div className="relative min-w-0 flex-1 basis-40">
          <HugeiconsIcon
            icon={SearchIcon}
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={intl.formatMessage(contentEditorQueuePanelMessages.searchPlaceholder)}
            aria-label={intl.formatMessage(contentEditorQueuePanelMessages.searchAria)}
            className="h-8 pl-9 font-mono text-xs"
          />
          {isSearching ? (
            <Spinner className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2" />
          ) : null}
        </div>
      ) : null}

      <div className="flex shrink-0 items-center gap-1.5">
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
                  aria-label={intl.formatMessage(contentEditorQueuePanelMessages.filterQueueAria)}
                />
              }
            >
              <HugeiconsIcon icon={FilterIcon} className="size-3.5" />
              <span className="text-xs">
                <FormattedMessage {...queueFilterMessageByValue[queueFilter]} />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <FormattedMessage {...contentEditorQueuePanelMessages.filterQueueAria} />
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={queueFilter}
                  onValueChange={(value) => onQueueFilterChange(value as ContentEditorQueueFilter)}
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
        ) : null}

        {showSort ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "size-8 shrink-0 px-0 font-normal",
                    hasActiveSort && "border-grove-400/40",
                  )}
                  aria-label={intl.formatMessage(contentEditorQueuePanelMessages.sortQueueAria)}
                />
              }
            >
              <HugeiconsIcon icon={Sorting01Icon} className="size-3.5" />
              <span className="sr-only">
                <FormattedMessage {...queueSortMessageByValue[queueSort]} />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <FormattedMessage {...contentEditorQueuePanelMessages.sortQueueAria} />
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={queueSort}
                  onValueChange={(value) => onQueueSortChange?.(value as ContentEditorQueueSort)}
                >
                  {availableQueueSorts.map((sortValue) => (
                    <DropdownMenuRadioItem key={sortValue} value={sortValue}>
                      <FormattedMessage {...queueSortMessageByValue[sortValue]} />
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {onDownloadFilteredView ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-8 shrink-0 px-0 font-normal"
                  disabled={isDownloadingFilteredView}
                  aria-label={intl.formatMessage(
                    contentEditorQueuePanelMessages.downloadFilteredAria,
                  )}
                />
              }
            >
              {isDownloadingFilteredView ? (
                <Spinner className="size-3.5" />
              ) : (
                <HugeiconsIcon icon={Download01Icon} className="size-3.5" />
              )}
              <span className="sr-only">
                <FormattedMessage {...contentEditorQueuePanelMessages.downloadFiltered} />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <FormattedMessage
                    {...contentEditorQueuePanelMessages.downloadFilteredFormatLabel}
                  />
                </DropdownMenuLabel>
                {(["csv", "tmx", "xlf", "xliff"] as const).map((format) => (
                  <DropdownMenuItem key={format} onClick={() => onDownloadFilteredView(format)}>
                    {format.toUpperCase()}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {hasBulkActions ? (
          <label className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <input
              type="checkbox"
              className="size-3.5 rounded border-input accent-foreground"
              checked={selectionMode}
              aria-label={intl.formatMessage(contentEditorQueuePanelMessages.showSelectionAria)}
              onChange={(event) => onSelectionModeChange?.(event.currentTarget.checked)}
            />
            <span className="sr-only">
              <FormattedMessage {...contentEditorQueuePanelMessages.showSelection} />
            </span>
          </label>
        ) : null}

        {selectionMode && hasBulkActions ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-8 shrink-0"
                  aria-label={intl.formatMessage(contentEditorQueuePanelMessages.queueActionsAria)}
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
                      {...contentEditorQueuePanelMessages.bulkSelectionSummary}
                      values={{ count: selectedCount }}
                    />
                  ) : (
                    <FormattedMessage {...contentEditorQueuePanelMessages.queueActionsAria} />
                  )}
                </DropdownMenuLabel>
                {onSelectAllVisible ? (
                  <DropdownMenuItem
                    onClick={onSelectAllVisible}
                    disabled={selectableVisibleCount === 0}
                  >
                    <FormattedMessage {...contentEditorQueuePanelMessages.bulkSelectAll} />
                  </DropdownMenuItem>
                ) : null}
                {onClearChecked ? (
                  <DropdownMenuItem onClick={onClearChecked} disabled={selectedCount === 0}>
                    <FormattedMessage {...contentEditorQueuePanelMessages.bulkClearSelection} />
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {onBulkApprove ? (
                  <DropdownMenuItem
                    onClick={onBulkApprove}
                    disabled={!bulkTargetsReady || selectedCount === 0}
                  >
                    <FormattedMessage {...contentEditorQueuePanelMessages.bulkApprove} />
                  </DropdownMenuItem>
                ) : null}
                {onBulkSkip ? (
                  <DropdownMenuItem
                    onClick={onBulkSkip}
                    disabled={!bulkTargetsReady || selectedCount === 0}
                  >
                    <FormattedMessage {...contentEditorQueuePanelMessages.bulkSkip} />
                  </DropdownMenuItem>
                ) : null}
                {onBulkHide ? (
                  <DropdownMenuItem
                    onClick={onBulkHide}
                    disabled={!bulkTargetsReady || selectedCount === 0}
                  >
                    <FormattedMessage {...contentEditorQueuePanelMessages.bulkHide} />
                  </DropdownMenuItem>
                ) : null}
                {onBulkUnhide ? (
                  <DropdownMenuItem
                    onClick={onBulkUnhide}
                    disabled={!bulkTargetsReady || selectedCount === 0}
                  >
                    <FormattedMessage {...contentEditorQueuePanelMessages.bulkUnhide} />
                  </DropdownMenuItem>
                ) : null}
                {onBulkLock ? (
                  <DropdownMenuItem
                    onClick={onBulkLock}
                    disabled={!bulkTargetsReady || selectedCount === 0}
                  >
                    <FormattedMessage {...contentEditorQueuePanelMessages.bulkLock} />
                  </DropdownMenuItem>
                ) : null}
                {onBulkUnlock ? (
                  <DropdownMenuItem
                    onClick={onBulkUnlock}
                    disabled={!bulkTargetsReady || selectedCount === 0}
                  >
                    <FormattedMessage {...contentEditorQueuePanelMessages.bulkUnlock} />
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <ContentEditorWorkspaceViewSwitcherConnected />
      </div>
    </div>
  );
}
