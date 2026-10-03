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
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SidebarRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/primitives/cn";
import { contentEditorWorkspaceViewMessages } from "@/components/content-editor/workspace/content-editor-workspace.messages";

import type { ContentEditorFilteredExportFormat } from "@/lib/projects/content-editor/content-editor-filtered-export";

import {
  contentEditorQueueFilterValues,
  type ContentEditorQueueFilter,
  type ContentEditorQueueSort,
} from "./content-editor-queue-filter";
import { ContentEditorQueueToolbar } from "./content-editor-queue-toolbar";
import { CAT_QUEUE_TOOLBAR_HOST_ID } from "./content-editor-queue-toolbar-host";
import { useContentEditorWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-context";

export const ContentEditorQueueToolbarConnected = observer(
  function ContentEditorQueueToolbarConnected({
    onQueueSearchChange,
    onQueueFilterChange,
    availableQueueFilters = contentEditorQueueFilterValues,
    queueSort = "file_order",
    onQueueSortChange,
    availableQueueSorts,
    isSearching = false,
    isQueueLoading = false,
    visibleCount = 0,
    onSelectAllVisible,
    onBulkApprove,
    onBulkSkip,
    onBulkHide,
    onBulkUnhide,
    onBulkLock,
    onBulkUnlock,
    onDownloadFilteredView,
    isDownloadingFilteredView = false,
    adaptiveWorkspaceEnabled = false,
  }: {
    onQueueSearchChange?: (value: string) => void;
    onQueueFilterChange?: (filter: ContentEditorQueueFilter) => void;
    availableQueueFilters?: ContentEditorQueueFilter[];
    queueSort?: ContentEditorQueueSort;
    onQueueSortChange?: (sort: ContentEditorQueueSort) => void;
    availableQueueSorts?: ContentEditorQueueSort[];
    isSearching?: boolean;
    isQueueLoading?: boolean;
    visibleCount?: number;
    onSelectAllVisible?: () => void;
    onBulkApprove?: () => void;
    onBulkSkip?: () => void;
    onBulkHide?: () => void;
    onBulkUnhide?: () => void;
    onBulkLock?: () => void;
    onBulkUnlock?: () => void;
    onDownloadFilteredView?: (format: ContentEditorFilteredExportFormat) => void;
    isDownloadingFilteredView?: boolean;
    /** Gate for the adaptive workspace persona switcher. Off by default. */
    adaptiveWorkspaceEnabled?: boolean;
  }) {
    const intl = useIntl();
    const store = useContentEditorWorkspace();
    const [host, setHost] = useState<HTMLElement | null | undefined>(undefined);

    useEffect(() => {
      setHost(document.getElementById(CAT_QUEUE_TOOLBAR_HOST_ID));
    }, []);

    useEffect(() => {
      if (!store.ui.isFileView) {
        return;
      }

      // When the workspace switches into file view, clear selection mode so
      // stale checkboxes do not carry over to a context without a queue list.
      store.setSelectionMode(false);
    }, [store, store.ui.isFileView]);

    const handleSearchChange = useCallback(
      (value: string) => {
        store.setQueueSearch(value);
        onQueueSearchChange?.(value);
      },
      [onQueueSearchChange, store],
    );

    const handleFilterChange = useCallback(
      (filter: ContentEditorQueueFilter) => {
        if (onQueueFilterChange) {
          store.queue.setFilter(filter);
          onQueueFilterChange(filter);
          return;
        }

        store.setQueueFilter(filter);
      },
      [onQueueFilterChange, store],
    );

    const handleSortChange = useCallback(
      (sort: ContentEditorQueueSort) => {
        store.queue.setSort(sort);
        onQueueSortChange?.(sort);
      },
      [onQueueSortChange, store],
    );

    if (store.ui.isFileView) {
      return null;
    }

    const showDetailsToggle =
      store.ui.viewMode === "comfortable" || store.ui.viewMode === "side-by-side";
    const detailsToggleLabel = intl.formatMessage(
      store.ui.detailsPanelCollapsed
        ? contentEditorWorkspaceViewMessages.showDetailsPanel
        : contentEditorWorkspaceViewMessages.hideDetailsPanel,
    );

    const toolbar = (
      <>
        <ContentEditorQueueToolbar
          search={store.queueSearch}
          onSearchChange={onQueueSearchChange ? handleSearchChange : undefined}
          isSearching={isSearching}
          isQueueLoading={isQueueLoading}
          queueFilter={store.queueFilter}
          onQueueFilterChange={handleFilterChange}
          availableQueueFilters={availableQueueFilters}
          queueSort={queueSort}
          onQueueSortChange={onQueueSortChange ? handleSortChange : undefined}
          availableQueueSorts={availableQueueSorts}
          selectionMode={store.selectionMode}
          onSelectionModeChange={(enabled) => store.setSelectionMode(enabled)}
          selectedCount={store.checkedSegmentIds.size}
          visibleCount={visibleCount}
          onSelectAllVisible={onSelectAllVisible}
          onClearChecked={() => store.clearChecked()}
          onBulkApprove={onBulkApprove}
          onBulkSkip={onBulkSkip}
          onBulkHide={onBulkHide}
          onBulkUnhide={onBulkUnhide}
          onBulkLock={onBulkLock}
          onBulkUnlock={onBulkUnlock}
          isBulkActionPending={store.isBulkActionPending}
          bulkProgress={
            store.isBulkActionPending && store.bulkTotalCount > 0
              ? `${store.bulkCompletedCount}/${store.bulkTotalCount}`
              : undefined
          }
          onDownloadFilteredView={onDownloadFilteredView}
          isDownloadingFilteredView={isDownloadingFilteredView}
          adaptiveWorkspaceEnabled={adaptiveWorkspaceEnabled}
          resolvedPersona={adaptiveWorkspaceEnabled ? store.ui.resolvedPersona : undefined}
        />
        {showDetailsToggle ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className={cn(
                      "hidden size-8 shrink-0 lg:inline-flex",
                      !store.ui.detailsPanelCollapsed && "bg-muted",
                    )}
                    aria-pressed={!store.ui.detailsPanelCollapsed}
                    aria-label={detailsToggleLabel}
                    onClick={() => store.ui.toggleDetailsPanel()}
                  />
                }
              >
                <HugeiconsIcon
                  icon={SidebarRight01Icon}
                  className="size-4 text-foreground"
                  strokeWidth={2}
                />
              </TooltipTrigger>
              <TooltipContent>{detailsToggleLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </>
    );

    if (host === undefined) {
      return null;
    }

    if (!host) {
      return (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          {toolbar}
        </div>
      );
    }

    return createPortal(toolbar, host);
  },
);
