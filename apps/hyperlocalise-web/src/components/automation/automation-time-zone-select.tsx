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
import { useMemo } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatAutomationTimeZoneLabel,
  groupAutomationTimeZones,
  listAutomationTimeZones,
} from "@/lib/agents/automation-time-zones";
import { cn } from "@/lib/primitives/cn";

export function AutomationTimeZoneSelect({
  value,
  onValueChange,
  disabled,
  id,
  size = "default",
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  size?: "sm" | "default";
  className?: string;
  "aria-label"?: string;
}) {
  const groups = useMemo(() => groupAutomationTimeZones(listAutomationTimeZones(value)), [value]);

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (!next) {
          return;
        }
        onValueChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-label={ariaLabel}
        className={cn("min-w-52", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72 min-w-72" alignItemWithTrigger={false}>
        {groups.map((group) => (
          <SelectGroup key={group.id}>
            {group.id === "UTC" ? null : <SelectLabel>{group.id}</SelectLabel>}
            {group.zones.map((zone) => (
              <SelectItem key={zone} value={zone}>
                {formatAutomationTimeZoneLabel(zone)}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
