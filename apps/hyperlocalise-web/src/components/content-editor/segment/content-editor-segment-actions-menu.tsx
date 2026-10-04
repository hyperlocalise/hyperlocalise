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
import {
  HistoryIcon,
  Link01Icon,
  LockIcon,
  Message01Icon,
  MoreHorizontalIcon,
  SquareUnlock01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import {
  useSegmentActivityOpener,
  type SegmentActivitySelection,
} from "@/components/content-editor/activity-log/content-editor-segment-activity";
import { contentEditorSegmentActionsMessages as messages } from "@/components/content-editor/shared/content-editor-chrome.messages";
import { contentEditorEditorPanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/primitives/cn";

export function ContentEditorSegmentActionsMenu({
  segmentShareUrl = null,
  onAddToIssueSheet,
  isAddToIssueSheetDisabled = false,
  isLocked = false,
  onToggleLocked,
  activity,
  className,
}: {
  segmentShareUrl?: string | null;
  onAddToIssueSheet?: () => void;
  isAddToIssueSheetDisabled?: boolean;
  isLocked?: boolean;
  onToggleLocked?: () => void;
  activity?: SegmentActivitySelection;
  className?: string;
}) {
  const intl = useIntl();
  const openActivity = useSegmentActivityOpener();
  const canOpenActivity = Boolean(openActivity && activity);
  const hasShareOrIssue = Boolean(segmentShareUrl || onAddToIssueSheet);
  const hasStateOrHistory = Boolean(onToggleLocked || canOpenActivity);

  if (!hasShareOrIssue && !hasStateOrHistory) {
    return null;
  }

  const copyLink = async () => {
    if (!segmentShareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(segmentShareUrl);
      toast.success(intl.formatMessage(messages.linkCopied));
    } catch {
      toast.error(intl.formatMessage(messages.linkCopyFailed));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn("shrink-0", className)}
            aria-label={intl.formatMessage(messages.triggerAria)}
            title={intl.formatMessage(messages.triggerAria)}
          />
        }
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {hasShareOrIssue ? (
          <DropdownMenuGroup>
            {segmentShareUrl ? (
              <DropdownMenuItem onClick={() => void copyLink()}>
                <HugeiconsIcon icon={Link01Icon} className="size-4" aria-hidden />
                <FormattedMessage {...messages.copyLink} />
              </DropdownMenuItem>
            ) : null}
            {onAddToIssueSheet ? (
              <DropdownMenuItem onClick={onAddToIssueSheet} disabled={isAddToIssueSheetDisabled}>
                <HugeiconsIcon icon={Message01Icon} className="size-4" aria-hidden />
                <FormattedMessage {...contentEditorEditorPanelMessages.addToIssueSheet} />
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        ) : null}
        {hasShareOrIssue && hasStateOrHistory ? <DropdownMenuSeparator /> : null}
        {hasStateOrHistory ? (
          <DropdownMenuGroup>
            {onToggleLocked ? (
              <DropdownMenuItem onClick={onToggleLocked}>
                <HugeiconsIcon
                  icon={isLocked ? SquareUnlock01Icon : LockIcon}
                  className="size-4"
                  aria-hidden
                />
                <FormattedMessage {...(isLocked ? messages.unlock : messages.lock)} />
              </DropdownMenuItem>
            ) : null}
            {canOpenActivity && openActivity && activity ? (
              <DropdownMenuItem onClick={() => openActivity(activity)}>
                <HugeiconsIcon icon={HistoryIcon} className="size-4" aria-hidden />
                <FormattedMessage {...messages.activity} />
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
