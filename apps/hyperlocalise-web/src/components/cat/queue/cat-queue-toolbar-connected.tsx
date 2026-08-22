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

import { catQueueFilterValues, type CatQueueFilter, type CatQueueSort } from "./cat-queue-filter";
import { CatQueueToolbar } from "./cat-queue-toolbar";
import { CAT_QUEUE_TOOLBAR_HOST_ID } from "./cat-queue-toolbar-host";
import { useCatWorkspace } from "@/components/cat/workspace/cat-workspace-context";

export const CatQueueToolbarConnected = observer(function CatQueueToolbarConnected({
  onQueueSearchChange,
  onQueueFilterChange,
  availableQueueFilters = catQueueFilterValues,
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
}: {
  onQueueSearchChange?: (value: string) => void;
  onQueueFilterChange?: (filter: CatQueueFilter) => void;
  availableQueueFilters?: CatQueueFilter[];
  queueSort?: CatQueueSort;
  onQueueSortChange?: (sort: CatQueueSort) => void;
  availableQueueSorts?: CatQueueSort[];
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
  onDownloadFilteredView?: (format: "csv" | "tmx" | "xlf" | "xliff") => void;
  isDownloadingFilteredView?: boolean;
}) {
  const store = useCatWorkspace();
  const [host, setHost] = useState<HTMLElement | null | undefined>(undefined);

  useEffect(() => {
    setHost(document.getElementById(CAT_QUEUE_TOOLBAR_HOST_ID));
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      store.setQueueSearch(value);
      onQueueSearchChange?.(value);
    },
    [onQueueSearchChange, store],
  );

  const handleFilterChange = useCallback(
    (filter: CatQueueFilter) => {
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
    (sort: CatQueueSort) => {
      store.queue.setSort(sort);
      onQueueSortChange?.(sort);
    },
    [onQueueSortChange, store],
  );

  const toolbar = (
    <CatQueueToolbar
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
      onDownloadFilteredView={onDownloadFilteredView}
      isDownloadingFilteredView={isDownloadingFilteredView}
    />
  );

  if (host === undefined) {
    return null;
  }

  if (!host) {
    return toolbar;
  }

  return createPortal(toolbar, host);
});
