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
import { File01Icon, LayoutGridIcon, LayoutThreeColumnIcon } from "@hugeicons/core-free-icons";
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
import { isCatWorkspaceViewMode } from "@/components/cat/workspace/cat-workspace-view-mode";

const DEFAULT_AVAILABLE_VIEWS = [
  "comfortable",
  "side-by-side",
] as const satisfies readonly CatWorkspaceViewMode[];

function viewModeIcon(mode: CatWorkspaceViewMode) {
  if (mode === "file") {
    return File01Icon;
  }
  if (mode === "side-by-side") {
    return LayoutGridIcon;
  }
  return LayoutThreeColumnIcon;
}

function viewModeLabel(mode: CatWorkspaceViewMode) {
  if (mode === "file") {
    return catWorkspaceViewModeMessages.fileView;
  }
  if (mode === "side-by-side") {
    return catWorkspaceViewModeMessages.sideBySideView;
  }
  return catWorkspaceViewModeMessages.comfortableView;
}

export function CatWorkspaceViewSwitcher({
  value,
  onChange,
  availableViews = DEFAULT_AVAILABLE_VIEWS,
  className,
}: {
  value: CatWorkspaceViewMode;
  onChange: (mode: CatWorkspaceViewMode) => void;
  availableViews?: readonly CatWorkspaceViewMode[];
  className?: string;
}) {
  const intl = useIntl();
  const modes = availableViews.length > 0 ? availableViews : DEFAULT_AVAILABLE_VIEWS;

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
        <HugeiconsIcon icon={viewModeIcon(value)} className="size-4" />
        <span className="hidden text-xs sm:inline">
          <FormattedMessage {...viewModeLabel(value)} />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) => {
            if (isCatWorkspaceViewMode(nextValue) && modes.includes(nextValue)) {
              onChange(nextValue);
            }
          }}
        >
          {modes.map((mode) => (
            <DropdownMenuRadioItem key={mode} value={mode}>
              <FormattedMessage {...viewModeLabel(mode)} />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
