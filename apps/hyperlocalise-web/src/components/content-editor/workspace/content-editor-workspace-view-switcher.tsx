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

import { contentEditorWorkspaceViewModeMessages } from "@/components/content-editor/shared/content-editor.messages";
import type { ContentEditorWorkspaceViewMode } from "@/components/content-editor/workspace/content-editor-workspace-view-mode";
import { isCatWorkspaceViewMode } from "@/components/content-editor/workspace/content-editor-workspace-view-mode";

const DEFAULT_AVAILABLE_VIEWS = [
  "comfortable",
  "side-by-side",
] as const satisfies readonly ContentEditorWorkspaceViewMode[];

function viewModeIcon(mode: ContentEditorWorkspaceViewMode) {
  if (mode === "file") {
    return File01Icon;
  }
  if (mode === "side-by-side") {
    return LayoutGridIcon;
  }
  return LayoutThreeColumnIcon;
}

function viewModeLabel(mode: ContentEditorWorkspaceViewMode) {
  if (mode === "file") {
    return contentEditorWorkspaceViewModeMessages.fileView;
  }
  if (mode === "side-by-side") {
    return contentEditorWorkspaceViewModeMessages.sideBySideView;
  }
  return contentEditorWorkspaceViewModeMessages.comfortableView;
}

export function ContentEditorWorkspaceViewSwitcher({
  value,
  onChange,
  availableViews = DEFAULT_AVAILABLE_VIEWS,
  className,
  size = "sm",
  variant = "outline",
}: {
  value: ContentEditorWorkspaceViewMode;
  onChange: (mode: ContentEditorWorkspaceViewMode) => void;
  availableViews?: readonly ContentEditorWorkspaceViewMode[];
  className?: string;
  size?: "sm" | "xs";
  variant?: "outline" | "ghost";
}) {
  const intl = useIntl();
  const modes = availableViews.length > 0 ? availableViews : DEFAULT_AVAILABLE_VIEWS;
  const compact = size === "xs";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={variant}
            size={compact ? "icon-xs" : "sm"}
            className={cn(compact ? "shrink-0" : "size-8 shrink-0 px-0", "font-normal", className)}
            aria-label={intl.formatMessage(contentEditorWorkspaceViewModeMessages.viewModeAria)}
          />
        }
      >
        <HugeiconsIcon icon={viewModeIcon(value)} className={compact ? "size-3" : "size-4"} />
        <span className="sr-only">
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
