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
import { useHotkeys } from "react-hotkeys-hook";

export function useCatEditorHotkeys({
  hasPreviousSegment,
  hasNextSegment,
  canTriggerApprove,
  canTriggerFindContext,
  onPrevious,
  onNext,
  onApprove,
  onAskQuestion,
}: {
  hasPreviousSegment: boolean;
  hasNextSegment: boolean;
  canTriggerApprove: boolean;
  canTriggerFindContext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onApprove: () => void;
  onAskQuestion: () => void;
}) {
  useHotkeys(
    "mod+arrowleft, mod+arrowup",
    (event) => {
      event.preventDefault();
      onPrevious();
    },
    {
      enabled: hasPreviousSegment,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [hasPreviousSegment, onPrevious],
  );

  useHotkeys(
    "mod+arrowright, mod+arrowdown",
    (event) => {
      event.preventDefault();
      onNext();
    },
    {
      enabled: hasNextSegment,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [hasNextSegment, onNext],
  );

  useHotkeys(
    "mod+enter",
    (event) => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement.dataset.catCommentInput === "true"
      ) {
        return;
      }

      event.preventDefault();
      onApprove();
    },
    {
      enabled: canTriggerApprove,
      enableOnFormTags: true,
      // TipTap uses contenteditable; without this, ⌘↵ / Ctrl+Enter is ignored while typing.
      enableOnContentEditable: true,
      preventDefault: true,
    },
    [canTriggerApprove, onApprove],
  );

  useHotkeys(
    "mod+k",
    (event) => {
      event.preventDefault();
      onAskQuestion();
    },
    {
      enabled: canTriggerFindContext,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [canTriggerFindContext, onAskQuestion],
  );
}
