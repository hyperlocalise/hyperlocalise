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
import { useCallback, useRef } from "react";

export function isNearEndOfVirtualList(input: {
  lastVisibleIndex: number | undefined;
  itemCount: number;
  prefetchDistance: number;
}) {
  if (input.lastVisibleIndex == null || input.itemCount === 0) {
    return false;
  }

  return input.lastVisibleIndex >= Math.max(input.itemCount - input.prefetchDistance, 0);
}

export function planNearEndPageRequest(input: {
  isNearEnd: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  alreadyRequestedAtEnd: boolean;
}) {
  if (!input.isNearEnd) {
    return { request: false, requestedAtEnd: false };
  }

  if (!input.hasMore) {
    return { request: false, requestedAtEnd: input.alreadyRequestedAtEnd };
  }

  if (input.isLoadingMore || input.alreadyRequestedAtEnd) {
    return { request: false, requestedAtEnd: true };
  }

  return { request: true, requestedAtEnd: true };
}

export function useNearEndPagination({
  hasMore,
  isLoadingMore = false,
  itemCount,
  prefetchDistance,
  onNearEnd,
}: {
  hasMore: boolean;
  isLoadingMore?: boolean;
  itemCount: number;
  prefetchDistance: number;
  onNearEnd?: () => void;
}) {
  const requestedAtEndRef = useRef(false);

  return useCallback(
    (items: Array<{ index: number }>) => {
      const plan = planNearEndPageRequest({
        isNearEnd: isNearEndOfVirtualList({
          lastVisibleIndex: items.at(-1)?.index,
          itemCount,
          prefetchDistance,
        }),
        hasMore,
        isLoadingMore,
        alreadyRequestedAtEnd: requestedAtEndRef.current,
      });
      requestedAtEndRef.current = plan.requestedAtEnd;
      if (plan.request) {
        onNearEnd?.();
      }
    },
    [hasMore, isLoadingMore, itemCount, onNearEnd, prefetchDistance],
  );
}
