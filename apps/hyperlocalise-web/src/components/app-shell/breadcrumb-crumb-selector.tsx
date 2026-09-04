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
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuHint,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/primitives/cn";

import { breadcrumbCrumbSelectorMessages as messages } from "./breadcrumb-crumb-selector.messages";

export type BreadcrumbCrumbSelectorOption = {
  value: string;
  label: string;
};

type BreadcrumbCrumbSelectorProps = {
  value: string;
  label: string;
  options: readonly BreadcrumbCrumbSelectorOption[];
  onSelect: (value: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  menuLabel?: string;
  isLast?: boolean;
  disabled?: boolean;
};

export function BreadcrumbCrumbSelector({
  value,
  label,
  options,
  onSelect,
  isLoading = false,
  isError = false,
  menuLabel,
  isLast = false,
  disabled = false,
}: BreadcrumbCrumbSelectorProps) {
  const hasMultipleOptions = options.length > 1;

  if (!hasMultipleOptions && !isLoading) {
    return (
      <span
        className={cn(
          "block truncate font-semibold text-foreground",
          isLast ? "text-base" : "text-sm",
        )}
        title={label}
      >
        {label}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled || isLoading}
        render={
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-auto max-w-full gap-1 px-0 py-0 font-semibold hover:bg-transparent",
              isLast
                ? "text-base text-foreground hover:text-foreground"
                : "text-sm font-medium text-muted-foreground hover:text-foreground",
            )}
          />
        }
      >
        {isLoading ? (
          <Skeleton aria-hidden className={cn("rounded-md", isLast ? "h-5 w-28" : "h-4 w-24")} />
        ) : (
          <span className="truncate">{label}</span>
        )}
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.8} className="size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56" align="start">
        <DropdownMenuGroup>
          {menuLabel ? <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel> : null}
          {isError ? (
            <DropdownMenuItem disabled>
              <FormattedMessage {...messages.loadError} />
            </DropdownMenuItem>
          ) : null}
          {!isLoading && !isError && options.length === 0 ? (
            <DropdownMenuItem disabled>
              <FormattedMessage {...messages.empty} />
            </DropdownMenuItem>
          ) : null}
          {options.map((option) => (
            <DropdownMenuItem key={option.value} onClick={() => onSelect(option.value)}>
              <span className="truncate">{option.label}</span>
              {option.value === value ? (
                <DropdownMenuHint>
                  <FormattedMessage {...messages.selected} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
