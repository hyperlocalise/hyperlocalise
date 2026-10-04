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
  CaretDownIcon,
  ListChecksIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useHotkeys } from "react-hotkeys-hook";
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
import type { ContentEditorFilteredExportFormat } from "@/lib/projects/content-editor/content-editor-filtered-export";
import { cn } from "@/lib/primitives/cn";

import {
  contentEditorQueueFilterValues,
  contentEditorQueueSortValues,
  type ContentEditorQueueFilter,
  type ContentEditorQueueSort,
} from "./content-editor-queue-filter";
import { queueFilterMessageByValue } from "./content-editor-queue-filter-messages";
import { ContentEditorOverflowMenu } from "./content-editor-overflow-menu";
import { ContentEditorViewMenu } from "./content-editor-view-menu";
import { contentEditorBulkBarMessages } from "@/components/content-editor/shared/content-editor-chrome.messages";
import { contentEditorQueuePanelMessages } from "@/components/content-editor/shared/content-editor.messages";

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
  bulkProgress,
  isQueueLoading = false,
  onDownloadFilteredView,
  isDownloadingFilteredView = false,
  adaptiveWorkspaceEnabled = false,
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
  bulkProgress?: string;
  /**
   * When the queue query is showing placeholder data, or the store has not
   * ingested the current snapshot yet, visible segments may still be from the
   * previous page. Bulk select/mutate must wait until both are ready.
   */
  isQueueLoading?: boolean;
  onDownloadFilteredView?: (format: ContentEditorFilteredExportFormat) => void;
  isDownloadingFilteredView?: boolean;
  /** When true, the View menu offers the adaptive workspace persona switch. Off by default. */
  adaptiveWorkspaceEnabled?: boolean;
}) {
  const intl = useIntl();
  const canEnterSelectionMode = Boolean(onSelectionModeChange);
  const isSelecting = canEnterSelectionMode && selectionMode;
  const showBulkBar = isSelecting && selectedCount > 0;
  const hasActiveFilter = queueFilter !== "all";
  // Placeholder reuse or a not-yet-ingested cache hit can keep chrome mounted
  // while the store still holds the previous page — never treat those ids as
  // bulk targets.
  const bulkTargetsReady = !isQueueLoading;
  const selectableVisibleCount = bulkTargetsReady ? visibleCount : 0;

  useHotkeys("escape", () => onSelectionModeChange?.(false), {
    enabled: isSelecting && !isBulkActionPending,
  });

  const selectAllButton = onSelectAllVisible ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 text-xs"
      onClick={onSelectAllVisible}
      disabled={selectableVisibleCount === 0 || isBulkActionPending}
    >
      <FormattedMessage
        {...contentEditorBulkBarMessages.selectAllVisible}
        values={{ count: selectableVisibleCount }}
      />
    </Button>
  ) : null;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
      {showBulkBar ? (
        <ContentEditorBulkBar
          selectedCount={selectedCount}
          canMutate={bulkTargetsReady && !isBulkActionPending}
          isBulkActionPending={isBulkActionPending}
          bulkProgress={bulkProgress}
          selectAllButton={selectAllButton}
          onClearChecked={onClearChecked}
          onBulkApprove={onBulkApprove}
          onBulkSkip={onBulkSkip}
          onBulkHide={onBulkHide}
          onBulkUnhide={onBulkUnhide}
          onBulkLock={onBulkLock}
          onBulkUnlock={onBulkUnlock}
          onDone={() => onSelectionModeChange?.(false)}
        />
      ) : (
        <>
          {onSearchChange ? (
            <div className="relative min-w-0 flex-1 basis-40">
              <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
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

          {onQueueFilterChange ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 shrink-0 gap-1.5 font-normal",
                      hasActiveFilter && "border-grove-400/40",
                    )}
                    aria-label={intl.formatMessage(contentEditorQueuePanelMessages.filterQueueAria)}
                  />
                }
              >
                <FunnelIcon className="size-3.5" />
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
                    onValueChange={(value) =>
                      onQueueFilterChange(value as ContentEditorQueueFilter)
                    }
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

          {isSelecting ? selectAllButton : null}
        </>
      )}

      <div className="flex shrink-0 items-center gap-1.5">
        {canEnterSelectionMode && !showBulkBar ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("h-8 gap-1.5 font-normal", isSelecting && "border-foreground bg-muted")}
            aria-pressed={isSelecting}
            onClick={() => onSelectionModeChange?.(!isSelecting)}
          >
            <ListChecksIcon className="size-3.5" aria-hidden />
            <span className="text-xs">
              <FormattedMessage {...contentEditorBulkBarMessages.select} />
            </span>
          </Button>
        ) : null}
        <ContentEditorViewMenu
          showPersona={adaptiveWorkspaceEnabled}
          queueSort={queueSort}
          onQueueSortChange={onQueueSortChange}
          availableQueueSorts={availableQueueSorts}
        />
        <ContentEditorOverflowMenu
          filterLabel={intl.formatMessage(queueFilterMessageByValue[queueFilter])}
          onDownloadFilteredView={onDownloadFilteredView}
          isDownloadingFilteredView={isDownloadingFilteredView}
        />
      </div>
    </div>
  );
}

function ContentEditorBulkBar({
  selectedCount,
  canMutate,
  isBulkActionPending,
  bulkProgress,
  selectAllButton,
  onClearChecked,
  onBulkApprove,
  onBulkSkip,
  onBulkHide,
  onBulkUnhide,
  onBulkLock,
  onBulkUnlock,
  onDone,
}: {
  selectedCount: number;
  canMutate: boolean;
  isBulkActionPending: boolean;
  bulkProgress?: string;
  selectAllButton: ReactNode;
  onClearChecked?: () => void;
  onBulkApprove?: () => void;
  onBulkSkip?: () => void;
  onBulkHide?: () => void;
  onBulkUnhide?: () => void;
  onBulkLock?: () => void;
  onBulkUnlock?: () => void;
  onDone: () => void;
}) {
  const intl = useIntl();
  const moreActions = [
    { key: "hide", handler: onBulkHide, message: contentEditorQueuePanelMessages.bulkHide },
    { key: "unhide", handler: onBulkUnhide, message: contentEditorQueuePanelMessages.bulkUnhide },
    { key: "lock", handler: onBulkLock, message: contentEditorQueuePanelMessages.bulkLock },
    { key: "unlock", handler: onBulkUnlock, message: contentEditorQueuePanelMessages.bulkUnlock },
  ].filter((action) => Boolean(action.handler));

  return (
    <div
      role="toolbar"
      aria-label={intl.formatMessage(contentEditorBulkBarMessages.barAria)}
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2 py-0.5"
    >
      <span role="status" className="px-1 text-xs font-medium text-foreground tabular-nums">
        <FormattedMessage
          {...contentEditorBulkBarMessages.selectedCount}
          values={{ count: selectedCount }}
        />
      </span>
      {selectAllButton}
      {onBulkApprove ? (
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs"
          onClick={onBulkApprove}
          disabled={!canMutate}
        >
          <FormattedMessage {...contentEditorQueuePanelMessages.bulkApprove} />
        </Button>
      ) : null}
      {onBulkSkip ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={onBulkSkip}
          disabled={!canMutate}
        >
          <FormattedMessage {...contentEditorQueuePanelMessages.bulkSkip} />
        </Button>
      ) : null}
      {moreActions.length > 0 || onClearChecked ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs font-normal"
                disabled={isBulkActionPending}
              />
            }
          >
            <FormattedMessage {...contentEditorBulkBarMessages.more} />
            <CaretDownIcon className="size-3" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {moreActions.length > 0 ? (
              <DropdownMenuGroup>
                {moreActions.map((action) => (
                  <DropdownMenuItem key={action.key} onClick={action.handler} disabled={!canMutate}>
                    <FormattedMessage {...action.message} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ) : null}
            {moreActions.length > 0 && onClearChecked ? <DropdownMenuSeparator /> : null}
            {onClearChecked ? (
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onClearChecked} disabled={isBulkActionPending}>
                  <FormattedMessage {...contentEditorQueuePanelMessages.bulkClearSelection} />
                </DropdownMenuItem>
              </DropdownMenuGroup>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {isBulkActionPending ? (
        <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner className="size-3" />
          {bulkProgress ? <span className="tabular-nums">{bulkProgress}</span> : null}
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ms-auto h-7 text-xs"
        onClick={onDone}
        disabled={isBulkActionPending}
      >
        <FormattedMessage {...contentEditorBulkBarMessages.done} />
      </Button>
    </div>
  );
}
