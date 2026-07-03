"use client";

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
