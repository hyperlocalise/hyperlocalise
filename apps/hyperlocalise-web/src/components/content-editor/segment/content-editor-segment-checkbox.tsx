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
import { observer } from "mobx-react-lite";
import { useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { contentEditorQueuePanelMessages } from "@/components/content-editor/shared/content-editor.messages";

/** Lets keyboard shortcuts tell a focused selection tick box from an editor field. */
export const CONTENT_EDITOR_SEGMENT_CHECKBOX_ATTRIBUTE = "data-content-editor-segment-checkbox";

/**
 * Select-mode tick box for one string. It reads the ticked set itself, so a tick re-renders
 * only this box: the store changes the set in place.
 */
export const ContentEditorSegmentCheckbox = observer(function ContentEditorSegmentCheckbox({
  segmentId,
  segmentKey,
  checkedSegmentIds,
  onCheckedChange,
  className,
}: {
  segmentId: string;
  segmentKey: string;
  checkedSegmentIds?: ReadonlySet<string>;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  const intl = useIntl();

  return (
    <label className={cn("flex h-5 shrink-0 cursor-pointer items-center", className)}>
      <input
        type="checkbox"
        {...{ [CONTENT_EDITOR_SEGMENT_CHECKBOX_ATTRIBUTE]: "true" }}
        className="size-4 rounded border-input accent-foreground"
        checked={checkedSegmentIds?.has(segmentId) ?? false}
        aria-label={intl.formatMessage(contentEditorQueuePanelMessages.selectSegmentAria, {
          key: segmentKey,
        })}
        onChange={(event) => {
          event.stopPropagation();
          onCheckedChange(event.currentTarget.checked);
        }}
        onClick={(event) => {
          event.stopPropagation();
          // Safari and Firefox on Mac do not focus a clicked checkbox; the approve shortcut
          // checks for a focused tick box, so give it focus as Chrome does.
          event.currentTarget.focus({ preventScroll: true });
        }}
        // Rows that open a string on focus must not open it when the box is ticked.
        onFocus={(event) => event.stopPropagation()}
      />
    </label>
  );
});
