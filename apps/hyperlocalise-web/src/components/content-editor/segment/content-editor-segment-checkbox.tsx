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
 * Ticks or unticks a string from its tick box. `extendRange` is true on Shift-click (or
 * Shift+Space), when every row from the last box clicked to this one takes the same state.
 */
export type ContentEditorSegmentCheckHandler = (
  segmentId: string,
  checked: boolean,
  extendRange: boolean,
) => void;

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
  /** `extendRange` is true on Shift-click. */
  onCheckedChange: (checked: boolean, extendRange: boolean) => void;
  className?: string;
}) {
  const intl = useIntl();

  return (
    <label
      className={cn("flex h-5 shrink-0 cursor-pointer items-center", className)}
      // Shift-click would otherwise select the page's text from the last click to this one.
      onMouseDown={(event) => {
        if (event.shiftKey) event.preventDefault();
      }}
    >
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
          const { nativeEvent } = event;
          onCheckedChange(
            event.currentTarget.checked,
            nativeEvent instanceof MouseEvent && nativeEvent.shiftKey,
          );
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
