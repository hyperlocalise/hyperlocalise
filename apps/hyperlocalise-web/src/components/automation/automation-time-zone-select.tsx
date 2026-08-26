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
import { useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  filterAutomationTimeZoneGroups,
  formatAutomationTimeZoneLabel,
  groupAutomationTimeZones,
  listAutomationTimeZones,
} from "@/lib/agents/automation-time-zones";
import { cn } from "@/lib/primitives/cn";

import { automationTimeZoneSelectMessages } from "./automation-time-zone-select.messages";

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
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const groups = useMemo(() => groupAutomationTimeZones(listAutomationTimeZones(value)), [value]);
  const visibleGroups = useMemo(
    () => filterAutomationTimeZoneGroups(groups, search),
    [groups, search],
  );
  const selectedLabel = formatAutomationTimeZoneLabel(value);
  const searchPlaceholder = intl.formatMessage(automationTimeZoneSelectMessages.searchPlaceholder);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSearch("");
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            id={id}
            variant="outline"
            size={size}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-haspopup="listbox"
            className={cn(
              "min-w-52 justify-between gap-1.5 rounded-lg border-input bg-input/30 px-3 font-normal",
              className,
            )}
          />
        }
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={2} data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="min-w-72 p-0" sideOffset={4}>
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          <CommandList>
            <CommandEmpty>
              <FormattedMessage {...automationTimeZoneSelectMessages.empty} />
            </CommandEmpty>
            {visibleGroups.map((group) => (
              <CommandGroup key={group.id} heading={group.id === "UTC" ? undefined : group.id}>
                {group.zones.map((zone) => (
                  <CommandItem
                    key={zone}
                    value={zone}
                    data-checked={value === zone || undefined}
                    onSelect={() => {
                      onValueChange(zone);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    {formatAutomationTimeZoneLabel(zone)}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
