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
import { FilterIcon, MoreHorizontalCircle01Icon, SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DownloadIcon } from "lucide-react";
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

import { catQueueFilterValues, type CatQueueFilter } from "./cat-queue-filter";
import { catQueuePanelMessages } from "@/components/cat/shared/cat.messages";
import { CatWorkspaceViewSwitcherConnected } from "@/components/cat/workspace/cat-workspace-view-switcher-connected";

export const queueFilterMessageByValue: Record<
  CatQueueFilter,
  (typeof catQueuePanelMessages)[keyof typeof catQueuePanelMessages]
> = {
  all: catQueuePanelMessages.filterAll,
  untranslated: catQueuePanelMessages.filterUntranslated,
  needs_review: catQueuePanelMessages.filterNeedsReview,
  reviewed: catQueuePanelMessages.filterReviewed,
  has_issues: catQueuePanelMessages.filterHasIssues,
  skipped: catQueuePanelMessages.filterSkipped,
  hidden: catQueuePanelMessages.filterHidden,
};

export function CatQueueToolbar({
  search = "",
  onSearchChange,
  isSearching = false,
  queueFilter = "all",
  onQueueFilterChange,
  availableQueueFilters = catQueueFilterValues,
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
  isBulkActionPending = false,
  onDownloadFilteredView,
  isDownloadingFilteredView = false,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  isSearching?: boolean;
  queueFilter?: CatQueueFilter;
  onQueueFilterChange?: (filter: CatQueueFilter) => void;
  availableQueueFilters?: CatQueueFilter[];
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
  isBulkActionPending?: boolean;
  onDownloadFilteredView?: (format: "csv" | "tmx" | "xlf" | "xliff") => void;
  isDownloadingFilteredView?: boolean;
}) {
  const intl = useIntl();
  const hasBulkActions = Boolean(
    onSelectionModeChange && (onBulkApprove || onBulkSkip || onBulkHide || onBulkUnhide),
  );
  const hasActiveFilter = queueFilter !== "all";

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      {onSearchChange ? (
        <div className="relative min-w-0 flex-1 basis-40 sm:max-w-64">
          <HugeiconsIcon
            icon={SearchIcon}
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={intl.formatMessage(catQueuePanelMessages.searchPlaceholder)}
            aria-label={intl.formatMessage(catQueuePanelMessages.searchAria)}
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
                className={cn("h-8 gap-1.5 font-normal", hasActiveFilter && "border-grove-400/40")}
                aria-label={intl.formatMessage(catQueuePanelMessages.filterQueueAria)}
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
      ) : null}

      {onDownloadFilteredView ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 font-normal"
                disabled={isDownloadingFilteredView}
                aria-label={intl.formatMessage(catQueuePanelMessages.downloadFilteredAria)}
              />
            }
          >
            {isDownloadingFilteredView ? (
              <Spinner className="size-3.5" />
            ) : (
              <DownloadIcon className="size-3.5" />
            )}
            <span className="hidden text-xs sm:inline">
              <FormattedMessage {...catQueuePanelMessages.downloadFiltered} />
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <FormattedMessage {...catQueuePanelMessages.downloadFilteredFormatLabel} />
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
        <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <input
            type="checkbox"
            className="size-3.5 rounded border-input accent-foreground"
            checked={selectionMode}
            aria-label={intl.formatMessage(catQueuePanelMessages.showSelectionAria)}
            onChange={(event) => onSelectionModeChange?.(event.currentTarget.checked)}
          />
          <span className="hidden sm:inline">
            <FormattedMessage {...catQueuePanelMessages.showSelection} />
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
                <DropdownMenuItem onClick={onSelectAllVisible} disabled={visibleCount === 0}>
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
              {onBulkHide ? (
                <DropdownMenuItem onClick={onBulkHide} disabled={selectedCount === 0}>
                  <FormattedMessage {...catQueuePanelMessages.bulkHide} />
                </DropdownMenuItem>
              ) : null}
              {onBulkUnhide ? (
                <DropdownMenuItem onClick={onBulkUnhide} disabled={selectedCount === 0}>
                  <FormattedMessage {...catQueuePanelMessages.bulkUnhide} />
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <CatWorkspaceViewSwitcherConnected />
    </div>
  );
}
