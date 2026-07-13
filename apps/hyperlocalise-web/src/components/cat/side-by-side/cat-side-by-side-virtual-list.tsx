"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef } from "react";

import { cn } from "@/lib/primitives/cn";

import type { CatSegment } from "@/components/cat/shared/types";

import { CatSideBySideRow } from "./cat-side-by-side-row";

const ESTIMATED_ROW_HEIGHT = 72;

export function CatSideBySideVirtualList({
  segments,
  focusedSegmentId,
  hoveredSegmentId,
  dirtySegmentIds,
  canEdit,
  loadingSegmentIds,
  onFocusSegment,
  onHoverSegment,
  onLeaveSegment,
  onVisibleSegmentIdsChange,
  onTargetChange,
  hasMore = false,
  isLoadingMore = false,
  onNearEnd,
  className,
}: {
  segments: CatSegment[];
  focusedSegmentId: string;
  hoveredSegmentId: string | null;
  dirtySegmentIds?: ReadonlySet<string>;
  canEdit: boolean;
  loadingSegmentIds?: ReadonlySet<string>;
  onFocusSegment: (segmentId: string) => void;
  onHoverSegment: (segmentId: string) => void;
  onLeaveSegment: () => void;
  onVisibleSegmentIdsChange: (segmentIds: string[]) => void;
  onTargetChange: (segmentId: string, value: string) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onNearEnd?: () => void;
  className?: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const loadRequestedForLengthRef = useRef<number | null>(null);

  const checkForNearEnd = useCallback(
    (items: Array<{ index: number }>) => {
      if (items.length === 0 || segments.length === 0) {
        return;
      }

      const lastItem = items.at(-1);
      if (!lastItem || lastItem.index < Math.max(segments.length - 3, 0)) {
        return;
      }

      if (!hasMore || isLoadingMore || loadRequestedForLengthRef.current === segments.length) {
        return;
      }

      loadRequestedForLengthRef.current = segments.length;
      onNearEnd?.();
    },
    [hasMore, isLoadingMore, onNearEnd, segments.length],
  );

  const publishVisibleSegmentIds = useCallback(
    (items: Array<{ index: number }>) => {
      onVisibleSegmentIdsChange(
        items.flatMap((item) => {
          const segment = segments[item.index];
          return segment ? [segment.id] : [];
        }),
      );
    },
    [onVisibleSegmentIdsChange, segments],
  );

  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 6,
    onChange: (instance) => {
      const virtualItems = instance.getVirtualItems();
      checkForNearEnd(virtualItems);
      publishVisibleSegmentIds(virtualItems);
    },
  });

  useEffect(() => {
    if (!isLoadingMore) {
      loadRequestedForLengthRef.current = null;
    }
  }, [isLoadingMore]);

  useEffect(() => {
    const virtualItems = virtualizer.getVirtualItems();
    checkForNearEnd(virtualItems);
    publishVisibleSegmentIds(virtualItems);
  }, [checkForNearEnd, publishVisibleSegmentIds, virtualizer]);

  useEffect(
    () => () => {
      onVisibleSegmentIdsChange([]);
    },
    [onVisibleSegmentIdsChange],
  );

  return (
    <div ref={parentRef} className={cn("min-h-0 flex-1 overflow-auto", className)}>
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const segment = segments[virtualRow.index];
          if (!segment) {
            return null;
          }

          return (
            <div
              key={segment.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <CatSideBySideRow
                segment={segment}
                isFocused={segment.id === focusedSegmentId}
                isHovered={segment.id === hoveredSegmentId}
                isDirty={dirtySegmentIds?.has(segment.id) ?? false}
                canEdit={canEdit}
                isTargetLoading={loadingSegmentIds?.has(segment.id) ?? false}
                onFocus={() => onFocusSegment(segment.id)}
                onHover={() => onHoverSegment(segment.id)}
                onLeave={onLeaveSegment}
                onTargetChange={(value) => onTargetChange(segment.id, value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
