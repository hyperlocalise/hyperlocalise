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
import { cn } from "@/lib/primitives/cn";

export const CAT_QUEUE_TOOLBAR_HOST_ID = "cat-queue-toolbar-host";

export function CatQueueToolbarHost({ className }: { className?: string }) {
  return (
    <div
      id={CAT_QUEUE_TOOLBAR_HOST_ID}
      className={cn(
        "ms-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2",
        className,
      )}
    />
  );
}
