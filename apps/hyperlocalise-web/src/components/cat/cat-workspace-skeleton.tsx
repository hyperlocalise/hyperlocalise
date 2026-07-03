"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/primitives/cn";

import { CatQueueSkeletonList, CatQueueSummarySkeleton } from "./cat-queue-skeleton-list";

function CatEditorPanelSkeleton() {
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      aria-busy="true"
      aria-label="Loading editor"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-foreground/8 px-4 py-3 lg:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-4 w-16 rounded-full bg-foreground/8" />
          <Skeleton className="h-5 w-20 rounded-md bg-foreground/8" />
        </div>
        <div className="flex items-center gap-1">
          <Skeleton className="size-8 rounded-md bg-foreground/8" />
          <Skeleton className="size-8 rounded-md bg-foreground/8" />
          <Skeleton className="size-8 rounded-md bg-foreground/8" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-5 sm:px-6 lg:space-y-7 lg:px-8 lg:py-8">
          <section className="space-y-3">
            <Skeleton className="h-3 w-24 rounded-full bg-foreground/8" />
            <Skeleton className="h-20 w-full rounded-xl bg-foreground/8" />
          </section>

          <section className="space-y-3">
            <Skeleton className="h-3 w-28 rounded-full bg-foreground/8" />
            <Skeleton className="h-32 w-full rounded-xl bg-foreground/8" />
          </section>

          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-24 rounded-md bg-foreground/8" />
            <Skeleton className="h-9 w-28 rounded-md bg-foreground/8" />
            <Skeleton className="h-9 w-20 rounded-md bg-foreground/8" />
          </div>

          <section className="space-y-3">
            <Skeleton className="h-3 w-32 rounded-full bg-foreground/8" />
            <div className="space-y-0 divide-y divide-foreground/8 rounded-xl border border-foreground/8 bg-foreground/2">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex items-start gap-3 px-3 py-3">
                  <Skeleton className="size-4 shrink-0 rounded-full bg-foreground/8" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-36 rounded-full bg-foreground/8" />
                    <Skeleton className="h-3 w-10/12 rounded-full bg-foreground/8" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 border-t border-foreground/8 pt-5">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-20 rounded-full bg-foreground/8" />
              <Skeleton className="h-3 w-6 rounded-full bg-foreground/8" />
            </div>
            <ul className="space-y-3">
              {[0, 1].map((item) => (
                <li key={item} className="space-y-2 rounded-lg border border-foreground/8 p-3">
                  <Skeleton className="h-3 w-24 rounded-full bg-foreground/8" />
                  <Skeleton className="h-4 w-full rounded-full bg-foreground/8" />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function CatIntelligencePanelSkeleton() {
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background lg:border-l lg:border-foreground/8"
      aria-busy="true"
      aria-label="Loading intelligence"
    >
      <div className="shrink-0 border-b border-foreground/8 px-4 py-3">
        <Skeleton className="h-4 w-32 rounded-full bg-foreground/8" />
        <Skeleton className="mt-2 h-3 w-full max-w-xs rounded-full bg-foreground/8" />
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {[0, 1, 2].map((item) => (
          <div key={item} className="space-y-2">
            <Skeleton className="h-3 w-28 rounded-full bg-foreground/8" />
            <Skeleton className="h-16 w-full rounded-xl bg-foreground/8" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CatQueuePanelSkeleton() {
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background lg:border-r lg:border-foreground/8"
      aria-busy="true"
      aria-label="Loading queue"
    >
      <div className="shrink-0 space-y-3 border-b border-foreground/8 px-4 py-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-16 rounded-full bg-foreground/8" />
          <Skeleton className="h-3 w-full max-w-48 rounded-full bg-foreground/8" />
        </div>
        <Skeleton className="h-9 w-full rounded-md bg-foreground/8" />
        <Skeleton className="h-8 w-24 rounded-md bg-foreground/8" />
      </div>

      <div className="shrink-0 px-4 py-3">
        <Skeleton className="h-1.5 w-full rounded-full bg-foreground/8" />
      </div>

      <CatQueueSkeletonList />

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-foreground/8 px-4 py-3">
        <Skeleton className="h-3 w-28 rounded-full bg-foreground/8" />
        <div className="flex items-center gap-1">
          <Skeleton className="h-8 w-16 rounded-md bg-foreground/8" />
          <Skeleton className="h-8 w-12 rounded-md bg-foreground/8" />
        </div>
      </div>
    </div>
  );
}

function CatCompactWorkspaceSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-foreground/8 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-14 rounded-full bg-foreground/8" />
            <Skeleton className="h-4 w-32 rounded-full bg-foreground/8" />
          </div>
          <div className="shrink-0 space-y-2 text-right">
            <Skeleton className="ms-auto h-3 w-20 rounded-full bg-foreground/8" />
            <Skeleton className="ms-auto h-3 w-16 rounded-full bg-foreground/8" />
          </div>
        </div>
        <CatQueueSummarySkeleton className="mt-3" />
      </div>

      <div className="mx-4 mt-3 grid h-10 grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        <Skeleton className="h-full rounded-md bg-foreground/8" />
        <Skeleton className="h-full rounded-md bg-foreground/6" />
        <Skeleton className="h-full rounded-md bg-foreground/6" />
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-hidden">
        <CatEditorPanelSkeleton />
      </div>
    </div>
  );
}

export function CatWorkspaceSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background",
        className,
      )}
      aria-busy="true"
      aria-label="Loading CAT workspace"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
        <CatCompactWorkspaceSkeleton />
      </div>

      <div className="hidden h-full min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,22rem)] overflow-hidden lg:grid">
        <CatQueuePanelSkeleton />
        <CatEditorPanelSkeleton />
        <CatIntelligencePanelSkeleton />
      </div>
    </div>
  );
}
