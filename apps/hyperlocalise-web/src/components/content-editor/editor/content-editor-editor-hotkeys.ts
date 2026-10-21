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

import { getCatShortcutHotkey } from "./content-editor-keyboard-shortcuts";

function isCommentInputFocused() {
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLElement && activeElement.dataset.catCommentInput === "true";
}

/** TipTap renders the target as contenteditable; these must fire while typing in it. */
const WHILE_TYPING_OPTIONS = {
  enableOnFormTags: false,
  enableOnContentEditable: true,
  preventDefault: true,
} as const;

const OUTSIDE_TEXT_OPTIONS = {
  enableOnFormTags: false,
  preventDefault: true,
} as const;

export function useContentEditorEditorHotkeys({
  hasPreviousSegment,
  hasNextSegment,
  canTriggerApprove,
  canTriggerFindContext,
  canEditTarget = false,
  onPrevious,
  onNext,
  onPreviousUntranslated,
  onNextUntranslated,
  onApprove,
  onSaveDraft,
  onCopySource,
  onClearTarget,
  onAskQuestion,
}: {
  hasPreviousSegment: boolean;
  hasNextSegment: boolean;
  canTriggerApprove: boolean;
  canTriggerFindContext: boolean;
  canEditTarget?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onPreviousUntranslated?: () => void;
  onNextUntranslated?: () => void;
  onApprove: () => void;
  onSaveDraft?: () => void;
  onCopySource?: () => void;
  onClearTarget?: () => void;
  onAskQuestion: () => void;
}) {
  useHotkeys(
    getCatShortcutHotkey("previous"),
    () => onPrevious(),
    { ...OUTSIDE_TEXT_OPTIONS, enabled: hasPreviousSegment },
    [hasPreviousSegment, onPrevious],
  );

  useHotkeys(
    getCatShortcutHotkey("next"),
    () => onNext(),
    { ...OUTSIDE_TEXT_OPTIONS, enabled: hasNextSegment },
    [hasNextSegment, onNext],
  );

  useHotkeys(
    getCatShortcutHotkey("previousUntranslated"),
    () => onPreviousUntranslated?.(),
    { ...OUTSIDE_TEXT_OPTIONS, enabled: Boolean(onPreviousUntranslated) },
    [onPreviousUntranslated],
  );

  useHotkeys(
    getCatShortcutHotkey("nextUntranslated"),
    () => onNextUntranslated?.(),
    { ...OUTSIDE_TEXT_OPTIONS, enabled: Boolean(onNextUntranslated) },
    [onNextUntranslated],
  );

  useHotkeys(
    getCatShortcutHotkey("approve"),
    (event) => {
      if (isCommentInputFocused()) {
        return;
      }

      event.preventDefault();
      onApprove();
    },
    {
      enabled: canTriggerApprove,
      enableOnFormTags: true,
      enableOnContentEditable: true,
      // The comment box keeps ⌘↵ for itself, so prevent default only once we handle it.
      preventDefault: false,
    },
    [canTriggerApprove, onApprove],
  );

  useHotkeys(
    getCatShortcutHotkey("saveDraft"),
    () => {
      if (canTriggerApprove) {
        onSaveDraft?.();
      }
    },
    // Swallow ⌘S even when saving is unavailable so the browser save dialog never opens.
    { ...WHILE_TYPING_OPTIONS, enableOnFormTags: true, enabled: Boolean(onSaveDraft) },
    [canTriggerApprove, onSaveDraft],
  );

  useHotkeys(
    getCatShortcutHotkey("copySource"),
    () => onCopySource?.(),
    { ...WHILE_TYPING_OPTIONS, enabled: canEditTarget && Boolean(onCopySource) },
    [canEditTarget, onCopySource],
  );

  useHotkeys(
    getCatShortcutHotkey("clearTarget"),
    () => onClearTarget?.(),
    { ...WHILE_TYPING_OPTIONS, enabled: canEditTarget && Boolean(onClearTarget) },
    [canEditTarget, onClearTarget],
  );

  useHotkeys(
    getCatShortcutHotkey("findContext"),
    () => onAskQuestion(),
    { ...OUTSIDE_TEXT_OPTIONS, enabled: canTriggerFindContext },
    [canTriggerFindContext, onAskQuestion],
  );
}
