"use client";

import {
  CheckmarkCircle02Icon,
  FilterIcon,
  MoreHorizontalCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/primitives/cn";

import type { CatQueueSummary, CatSegment } from "./types";

function QueueStatusIcon({ status }: { status: CatSegment["status"] }) {
  if (status === "reviewed") {
    return <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 text-grove-300" />;
  }

  if (status === "needs_review") {
    return <span className="size-2.5 rounded-full bg-bud-400" />;
  }

  return <span className="size-2.5 rounded-full border border-foreground/25" />;
}

export function CatQueuePanel({
  segments,
  selectedSegmentId,
  summary,
  onSelectSegment,
}: {
  segments: CatSegment[];
  selectedSegmentId: string;
  summary: CatQueueSummary;
  onSelectSegment: (segmentId: string) => void;
}) {
  const progressValue =
    summary.total > 0 ? Math.round((summary.reviewed / summary.total) * 100) : 0;

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-foreground/8 bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-foreground/8 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Queue</h2>
          <p className="text-xs text-muted-foreground">
            {summary.total} total · {summary.reviewed} reviewed
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Filter queue">
            <HugeiconsIcon icon={FilterIcon} className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Queue actions">
            <HugeiconsIcon icon={MoreHorizontalCircle01Icon} className="size-4" />
          </Button>
        </div>
      </div>

      <div className="px-4 py-3">
        <Progress value={progressValue} className="h-1.5" />
      </div>

      <ScrollArea
        className="min-h-0 flex-1"
        maskHeight={44}
        maskClassName="before:via-background/90 before:backdrop-blur-[1px] after:via-background/90 after:backdrop-blur-[1px]"
      >
        <ul className="space-y-1 px-4 pb-3">
          {segments.map((segment) => {
            const selected = segment.id === selectedSegmentId;

            return (
              <li key={segment.id}>
                <button
                  type="button"
                  onClick={() => onSelectSegment(segment.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
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
                  <div className="mt-1 shrink-0">
                    <QueueStatusIcon status={segment.status} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}
