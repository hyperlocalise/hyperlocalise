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
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/primitives/cn";

type CheckedState = boolean | "indeterminate";

function Checkbox({
  className,
  checked,
  onCheckedChange,
  ...props
}: Omit<CheckboxPrimitive.Root.Props, "checked" | "onCheckedChange"> & {
  checked?: CheckedState;
  onCheckedChange?: (checked: CheckedState) => void;
}) {
  const indeterminate = checked === "indeterminate";
  const resolvedChecked = checked === "indeterminate" ? false : Boolean(checked);

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      checked={resolvedChecked}
      indeterminate={indeterminate}
      onCheckedChange={(nextChecked) => onCheckedChange?.(nextChecked)}
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input bg-background shadow-xs outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:bg-input/30 dark:data-checked:bg-primary",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2.5} className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
