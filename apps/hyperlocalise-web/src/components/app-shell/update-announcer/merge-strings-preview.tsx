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

const SEPARATE_STRING_WIDTHS = ["w-14", "w-10", "w-12"] as const;

/** Decorative sketch of several identical strings merging into one row. */
export function MergeStringsPreview() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-6 top-6 bottom-0 flex items-center gap-2 rounded-t-xl bg-background/90 p-3 shadow-lg ring-1 ring-black/5"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        {SEPARATE_STRING_WIDTHS.map((width, index) => (
          <div key={index} className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1.5">
            <span className={cn("h-1.5 rounded-full bg-muted-foreground/40", width)} />
            <span className="ms-auto h-1.5 w-5 rounded-full bg-muted-foreground/20" />
          </div>
        ))}
      </div>
      <svg viewBox="0 0 24 48" className="h-16 w-5 shrink-0 text-primary/50" fill="none">
        <path
          d="M2 6c10 0 10 18 20 18M2 24h20M2 42c10 0 10-18 20-18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex flex-1 items-center gap-1.5 rounded-md bg-primary/10 px-2 py-2 ring-1 ring-primary/25">
        <span className="h-1.5 w-12 rounded-full bg-primary/60" />
        <span className="ms-auto rounded-sm bg-primary/20 px-1 text-[0.625rem] leading-4 font-medium text-primary">
          ×3
        </span>
      </div>
    </div>
  );
}
