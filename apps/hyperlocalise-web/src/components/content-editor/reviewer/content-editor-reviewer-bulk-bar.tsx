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
  ArrowTurnForwardIcon,
  MoreHorizontalCircle01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/primitives/cn";

import { contentEditorQueuePanelMessages } from "@/components/content-editor/shared/content-editor.messages";

import { contentEditorReviewerMessages } from "./content-editor-reviewer.messages";

/**
 * Bulk handlers shared by the queue toolbar and the Reviewer bulk bar.
 * `isBlocked` is true while the visible queue may still hold the previous
 * page's ids, so no bulk target can be trusted yet.
 */
export type ContentEditorReviewerBulkActions = {
  isBlocked: boolean;
  onSelectAllVisible: () => void;
  onApprove?: () => void;
  onSkip?: () => void;
  onHide?: () => void;
  onUnhide?: () => void;
  onLock?: () => void;
  onUnlock?: () => void;
};

export function ContentEditorReviewerBulkBar({
  visibleSegmentIds,
  checkedSegmentIds,
  actions,
  isPending = false,
  progress,
  onClearChecked,
  className,
}: {
  visibleSegmentIds: readonly string[];
  checkedSegmentIds: ReadonlySet<string>;
  actions: ContentEditorReviewerBulkActions;
  isPending?: boolean;
  progress?: string;
  onClearChecked: () => void;
  className?: string;
}) {
  const intl = useIntl();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectedCount = checkedSegmentIds.size;
  const visibleCheckedCount = visibleSegmentIds.reduce(
    (count, segmentId) => (checkedSegmentIds.has(segmentId) ? count + 1 : count),
    0,
  );
  const allVisibleChecked =
    visibleSegmentIds.length > 0 && visibleCheckedCount === visibleSegmentIds.length;
  const someVisibleChecked = visibleCheckedCount > 0 && !allVisibleChecked;
  const canSelect = !actions.isBlocked && visibleSegmentIds.length > 0;
  const canRunBulk = !actions.isBlocked && !isPending && selectedCount > 0;
  const overflowActions = [
    { key: "hide", handler: actions.onHide, message: contentEditorQueuePanelMessages.bulkHide },
    {
      key: "unhide",
      handler: actions.onUnhide,
      message: contentEditorQueuePanelMessages.bulkUnhide,
    },
    { key: "lock", handler: actions.onLock, message: contentEditorQueuePanelMessages.bulkLock },
    {
      key: "unlock",
      handler: actions.onUnlock,
      message: contentEditorQueuePanelMessages.bulkUnlock,
    },
  ].filter((action) => Boolean(action.handler));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleChecked;
    }
  }, [someVisibleChecked]);

  return (
    <div
      role="toolbar"
      aria-label={intl.formatMessage(contentEditorReviewerMessages.bulkBarLabel)}
      data-testid="reviewer-bulk-bar"
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2",
        className,
      )}
    >
      <label className="flex cursor-pointer items-center">
        <input
          ref={selectAllRef}
          type="checkbox"
          className="size-4 rounded border-input accent-foreground"
          checked={allVisibleChecked}
          disabled={!canSelect}
          aria-label={intl.formatMessage(contentEditorReviewerMessages.selectAllVisibleAria)}
          onChange={(event) => {
            if (event.currentTarget.checked) {
              actions.onSelectAllVisible();
            } else {
              onClearChecked();
            }
          }}
        />
      </label>
      <span className="text-xs font-medium text-foreground tabular-nums" aria-live="polite">
        <FormattedMessage
          {...contentEditorReviewerMessages.selectedCount}
          values={{ count: selectedCount }}
        />
      </span>
      {progress ? (
        <span role="status" className="text-xs text-muted-foreground tabular-nums">
          {progress}
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-1.5">
        {actions.onApprove ? (
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            disabled={!canRunBulk}
            onClick={actions.onApprove}
          >
            {isPending ? (
              <Spinner className="size-3.5 text-primary-foreground" />
            ) : (
              <HugeiconsIcon icon={Tick02Icon} className="size-3.5" aria-hidden />
            )}
            <FormattedMessage {...contentEditorReviewerMessages.approveSelected} />
          </Button>
        ) : null}
        {actions.onSkip ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            disabled={!canRunBulk}
            onClick={actions.onSkip}
          >
            <HugeiconsIcon icon={ArrowTurnForwardIcon} className="size-3.5" aria-hidden />
            <FormattedMessage {...contentEditorReviewerMessages.skipSelected} />
          </Button>
        ) : null}
        {overflowActions.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-7"
                  disabled={!canRunBulk}
                  aria-label={intl.formatMessage(contentEditorReviewerMessages.moreActionsAria)}
                />
              }
            >
              <HugeiconsIcon icon={MoreHorizontalCircle01Icon} className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuGroup>
                {overflowActions.map((action) => (
                  <DropdownMenuItem key={action.key} onClick={action.handler}>
                    <FormattedMessage {...action.message} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={selectedCount === 0 || isPending}
          onClick={onClearChecked}
        >
          <FormattedMessage {...contentEditorReviewerMessages.clearSelection} />
        </Button>
      </div>
    </div>
  );
}
