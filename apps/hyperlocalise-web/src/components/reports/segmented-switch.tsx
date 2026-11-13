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
"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";

/** A row of mutually exclusive buttons, one always chosen: units, groupings and the like. */
export function SegmentedSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-[3px]"
      value={[value]}
      onValueChange={(next) => {
        const chosen = next[0] as T | undefined;
        if (chosen) onChange(chosen);
      }}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className="h-[30px] rounded-md px-3 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs"
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
