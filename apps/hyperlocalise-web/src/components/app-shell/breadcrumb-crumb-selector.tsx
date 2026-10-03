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
import { BreadcrumbLink } from "@/components/ui/breadcrumb";
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
import { OrgNavLink } from "./org-nav-link";

export type BreadcrumbCrumbSelectorOption = {
  value: string;
  label: string;
};

type BreadcrumbCrumbSelectorProps = {
  value: string;
  label: string;
  options: readonly BreadcrumbCrumbSelectorOption[];
  onSelect: (value: string) => void;
  href?: string;
  isLoading?: boolean;
  isError?: boolean;
  menuLabel?: string;
  isLast?: boolean;
  disabled?: boolean;
};

function CrumbLabel({ href, isLast, label }: { href?: string; isLast: boolean; label: string }) {
  if (href && !isLast) {
    return (
      <BreadcrumbLink
        render={<OrgNavLink href={href} />}
        className="block truncate text-sm font-medium text-muted-foreground hover:text-foreground"
        title={label}
      >
        {label}
      </BreadcrumbLink>
    );
  }

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

export function BreadcrumbCrumbSelector({
  value,
  label,
  options,
  onSelect,
  href,
  isLoading = false,
  isError = false,
  menuLabel,
  isLast = false,
  disabled = false,
}: BreadcrumbCrumbSelectorProps) {
  const hasMultipleOptions = options.length > 1;
  const canLink = Boolean(href) && !isLast;
  const showSwitcher = hasMultipleOptions || isLoading || (isError && !canLink);

  const labelNode = <CrumbLabel href={href} isLast={isLast} label={label} />;

  if (!showSwitcher) {
    return labelNode;
  }

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-0.5">
      {labelNode}
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled || isLoading}
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className={cn(
                "shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground",
                isLast ? "text-foreground" : undefined,
              )}
            />
          }
        >
          {isLoading ? (
            <Skeleton aria-hidden className="size-3.5 rounded-sm" />
          ) : (
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.8} className="size-3.5" />
          )}
          {menuLabel ? <span className="sr-only">{menuLabel}</span> : null}
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
    </span>
  );
}
