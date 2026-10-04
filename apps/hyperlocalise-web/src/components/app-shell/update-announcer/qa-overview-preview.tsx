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
import { cn } from "@/lib/primitives/cn";

const PREVIEW_BARS = [
  { height: "h-6", alert: false },
  { height: "h-10", alert: false },
  { height: "h-8", alert: false },
  { height: "h-14", alert: true },
  { height: "h-9", alert: false },
  { height: "h-12", alert: false },
  { height: "h-7", alert: false },
] as const;

/** Decorative sketch of the QA overview page for the update announcement media slot. */
export function QaOverviewPreview() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-6 top-6 bottom-0 rounded-t-xl bg-background/90 p-3 shadow-lg ring-1 ring-black/5"
    >
      <div className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-emerald-500" />
        <span className="h-1.5 w-16 rounded-full bg-muted-foreground/30" />
        <span className="ms-auto h-1.5 w-8 rounded-full bg-muted-foreground/20" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <span className="h-6 rounded-md bg-muted" />
        <span className="h-6 rounded-md bg-muted" />
        <span className="h-6 rounded-md bg-rose-500/15" />
      </div>
      <div className="mt-3 flex h-14 items-end gap-1.5">
        {PREVIEW_BARS.map((bar, index) => (
          <span
            key={index}
            className={cn(
              "flex-1 rounded-t-sm",
              bar.height,
              bar.alert ? "bg-rose-400/80" : "bg-primary/25",
            )}
          />
        ))}
      </div>
    </div>
  );
}
