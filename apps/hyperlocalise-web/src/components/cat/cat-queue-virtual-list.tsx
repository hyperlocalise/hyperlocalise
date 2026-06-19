"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import { useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { catQueuePanelMessages } from "./cat.messages";
import type { CatSegment } from "./types";

const ESTIMATED_ROW_HEIGHT = 72;

function QueueStatusDot({ status }: { status: CatSegment["status"] }) {
  if (status === "reviewed") {
    return <span className="size-2.5 rounded-full bg-grove-300" />;
  }

  if (status === "needs_review") {
    return <span className="size-2.5 rounded-full bg-bud-400" />;
  }

  return <span className="size-2.5 rounded-full border border-foreground/25" />;
}

export function CatQueueVirtualList({
  segments,
  selectedSegmentId,
  dirtySegmentIds,
  onSelectSegment,
  onNearEnd,
  className,
}: {
  segments: CatSegment[];
  selectedSegmentId: string;
  dirtySegmentIds?: ReadonlySet<string>;
  onSelectSegment: (segmentId: string) => void;
  onNearEnd?: () => void;
  className?: string;
}) {
  const intl = useIntl();
  const parentRef = useRef<HTMLDivElement>(null);
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
      onNearEnd?.();
    }
  }, [onNearEnd, segments.length, virtualizer]);

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

          return (
            <li
              key={segment.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <button
                type="button"
                onClick={() => onSelectSegment(segment.id)}
                className={cn(
                  "flex min-h-11 w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  selected
                    ? "bg-grove-500/10 ring-1 ring-inset ring-grove-400/25"
                    : "hover:bg-foreground/4",
                )}
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
