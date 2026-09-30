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
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MouseEvent } from "react";

import { cn } from "@/lib/primitives/cn";

export function VisualWorkflowQuickAddButton({
  label,
  handleId,
  className,
  onAdd,
}: {
  label: string;
  handleId?: string;
  className?: string;
  onAdd: (handleId?: string) => void;
}) {
  return (
    <button
      type="button"
      data-visual-workflow-add=""
      data-visual-workflow-add-handle={handleId ?? ""}
      className={cn(
        "nodrag nopan z-10 flex size-6 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm hover:bg-muted",
        className,
      )}
      aria-label={label}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onAdd(handleId);
      }}
    >
      <HugeiconsIcon icon={Add01Icon} className="size-3.5" strokeWidth={2} />
    </button>
  );
}
