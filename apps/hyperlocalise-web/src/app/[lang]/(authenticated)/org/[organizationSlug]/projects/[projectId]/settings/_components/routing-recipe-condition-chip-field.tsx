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
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/primitives/cn";

export type RoutingRecipeConditionOption = {
  value: string;
  label: string;
};

export function RoutingRecipeConditionChipField({
  selectedValues,
  options,
  onChange,
  disabled,
  placeholder,
  addButtonLabel,
  removeChipAriaLabel,
  emptyOptionsLabel,
}: {
  selectedValues: string[];
  options: RoutingRecipeConditionOption[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  placeholder: string;
  addButtonLabel: string;
  removeChipAriaLabel: (label: string) => string;
  emptyOptionsLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const labelByValue = useMemo(
    () => new Map(options.map((option) => [option.value, option.label])),
    [options],
  );
  const availableOptions = options.filter((option) => !selectedSet.has(option.value));

  function remove(value: string) {
    onChange(selectedValues.filter((entry) => entry !== value));
  }

  function add(value: string) {
    const nextValues = new Set([...selectedValues, value]);
    onChange(
      options.filter((option) => nextValues.has(option.value)).map((option) => option.value),
    );
  }

  const showEmptyOptionsHint =
    !disabled && options.length > 0 && availableOptions.length === 0 && selectedValues.length > 0;

  return (
    <div
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-input/30 px-2 py-1.5",
        disabled && "opacity-50",
      )}
    >
      {selectedValues.length === 0 ? (
        <span className="ps-1 text-sm text-muted-foreground">{placeholder}</span>
      ) : null}
      {selectedValues.map((value) => {
        const label = labelByValue.get(value) ?? value;
        return (
          <Badge key={value} variant="secondary" className="gap-0.5 rounded-md pe-0.5">
            <span>{label}</span>
            <button
              type="button"
              disabled={disabled}
              className="rounded-sm p-0.5 hover:bg-muted disabled:pointer-events-none"
              aria-label={removeChipAriaLabel(label)}
              onClick={() => remove(value)}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
            </button>
          </Badge>
        );
      })}
      {!disabled && options.length > 0 ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-muted-foreground"
                disabled={disabled || availableOptions.length === 0}
                aria-label={addButtonLabel}
              />
            }
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-3.5" />
            <span>{addButtonLabel}</span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-(--anchor-width) min-w-48 p-1" sideOffset={4}>
            <div className="max-h-[min(9rem,36vh)] overflow-y-auto overscroll-contain sm:max-h-[min(10.5rem,40vh)]">
              {availableOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => add(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
      {showEmptyOptionsHint ? (
        <span className="text-xs text-muted-foreground">{emptyOptionsLabel ?? placeholder}</span>
      ) : null}
      {disabled && options.length === 0 && emptyOptionsLabel ? (
        <span className="text-sm text-muted-foreground">{emptyOptionsLabel}</span>
      ) : null}
    </div>
  );
}
