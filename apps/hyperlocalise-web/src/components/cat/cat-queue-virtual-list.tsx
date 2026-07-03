"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import { useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { catQueuePanelMessages } from "./cat.messages";
import { CatSegmentTags } from "./cat-segment-tags";
import { QueueStatusDot } from "./cat-segment-status";
import type { CatSegment } from "./types";

const ESTIMATED_ROW_HEIGHT = 88;

export function CatQueueVirtualList({
  segments,
  selectedSegmentId,
  dirtySegmentIds,
  checkedSegmentIds,
  onToggleSegmentChecked,
  onSelectSegment,
  hasMore = false,
  isLoadingMore = false,
  onNearEnd,
  className,
}: {
  segments: CatSegment[];
  selectedSegmentId: string;
  dirtySegmentIds?: ReadonlySet<string>;
  checkedSegmentIds?: ReadonlySet<string>;
  onToggleSegmentChecked?: (segmentId: string, checked: boolean) => void;
  onSelectSegment: (segmentId: string) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onNearEnd?: () => void;
  className?: string;
}) {
  const intl = useIntl();
  const parentRef = useRef<HTMLDivElement>(null);
  const showSelection = Boolean(onToggleSegmentChecked);
  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
  });

  useEffect(() => {
    const items = virtualizer.getVirtualItems();
    if (items.length === 0 || segments.length === 0) {
      return;
    }

    const lastItem = items.at(-1);
    if (!lastItem) {
      return;
    }

    if (lastItem.index >= Math.max(segments.length - 3, 0)) {
      if (hasMore && !isLoadingMore) {
        onNearEnd?.();
      }
    }
  }, [hasMore, isLoadingMore, onNearEnd, segments.length, virtualizer]);

  return (
    <div ref={parentRef} className={cn("min-h-0 flex-1 overflow-auto px-4 pb-3", className)}>
      <ul className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const segment = segments[virtualRow.index];
          if (!segment) {
            return null;
          }

          const selected = segment.id === selectedSegmentId;
          const isDirty = dirtySegmentIds?.has(segment.id) ?? false;
          const isChecked = checkedSegmentIds?.has(segment.id) ?? false;

          return (
            <li
              key={segment.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div
                className={cn(
                  "flex min-h-11 w-full items-start gap-2 rounded-lg px-2 py-2.5 transition-colors",
                  selected
                    ? "bg-grove-500/10 ring-1 ring-inset ring-grove-400/25"
                    : "hover:bg-foreground/4",
                )}
              >
                {showSelection ? (
                  <label className="mt-1.5 flex shrink-0 cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-foreground/20 accent-foreground"
                      checked={isChecked}
                      aria-label={intl.formatMessage(catQueuePanelMessages.selectSegmentAria, {
                        key: segment.key,
                      })}
                      onChange={(event) => {
                        event.stopPropagation();
                        onToggleSegmentChecked?.(segment.id, event.currentTarget.checked);
                      }}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </label>
                ) : null}

                <button
                  type="button"
                  onClick={() => onSelectSegment(segment.id)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  <span className="mt-0.5 w-5 shrink-0 font-mono text-xs text-muted-foreground">
                    {String(segment.index).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="line-clamp-2 text-sm text-foreground/90">{segment.sourceText}</p>
                    <div className="flex min-w-0 items-center">
                      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                        {segment.key}
                      </span>
                    </div>
                    {segment.tags && segment.tags.length > 0 ? (
                      <CatSegmentTags tags={segment.tags} />
                    ) : null}
                  </div>
                  <div className="mt-1 flex shrink-0 flex-col items-center gap-1">
                    {isDirty ? (
                      <span
                        className="size-2 rounded-full bg-bud-400"
                        aria-label={intl.formatMessage(catQueuePanelMessages.unsavedChangesAria)}
                      />
                    ) : null}
                    <QueueStatusDot status={segment.status} />
                  </div>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
