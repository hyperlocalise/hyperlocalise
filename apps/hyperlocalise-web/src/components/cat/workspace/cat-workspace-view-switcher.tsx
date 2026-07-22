"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { LayoutGridIcon, LayoutThreeColumnIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/primitives/cn";

import { catWorkspaceViewModeMessages } from "@/components/cat/shared/cat.messages";
import type { CatWorkspaceViewMode } from "@/components/cat/workspace/cat-workspace-view-mode";

export function CatWorkspaceViewSwitcher({
  value,
  onChange,
  className,
}: {
  value: CatWorkspaceViewMode;
  onChange: (mode: CatWorkspaceViewMode) => void;
  className?: string;
}) {
  const intl = useIntl();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 gap-1.5 px-2.5 font-normal", className)}
            aria-label={intl.formatMessage(catWorkspaceViewModeMessages.viewModeAria)}
          />
        }
      >
        <HugeiconsIcon
          icon={value === "side-by-side" ? LayoutGridIcon : LayoutThreeColumnIcon}
          className="size-4"
        />
        <span className="hidden text-xs sm:inline">
          {value === "side-by-side" ? (
            <FormattedMessage {...catWorkspaceViewModeMessages.sideBySideView} />
          ) : (
            <FormattedMessage {...catWorkspaceViewModeMessages.comfortableView} />
          )}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) => {
            if (nextValue === "comfortable" || nextValue === "side-by-side") {
              onChange(nextValue);
            }
          }}
        >
          <DropdownMenuRadioItem value="comfortable">
            <FormattedMessage {...catWorkspaceViewModeMessages.comfortableView} />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="side-by-side">
            <FormattedMessage {...catWorkspaceViewModeMessages.sideBySideView} />
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
