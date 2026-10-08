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
import { useEffect, useEffectEvent, type RefObject } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useIsMac } from "@/hooks/use-is-mac";

/**
 * Whether a key press should reach the undo stack: it came from inside the root, or from the
 * page itself with nothing focused. Anything in a portal (a dialog, a menu, the chat dock) keeps
 * the browser's own undo.
 */
export function isUndoShortcutTarget(
  target: EventTarget | null,
  root: HTMLElement | null,
): boolean {
  if (target === document.body || target === document.documentElement) {
    return true;
  }
  return target instanceof Node && root !== null && root.contains(target);
}

/**
 * Binds undo and redo to the keyboard for one root element: Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z
 * (also Ctrl+Y outside macOS), the browser's own undo from a menu or a shake, and the close of
 * a typing burst when focus leaves a field. Nothing outside the root is affected.
 */
export function useUndoShortcuts({
  rootRef,
  enabled = true,
  onUndo,
  onRedo,
  onSeal,
}: {
  rootRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSeal?: () => void;
}) {
  const isMac = useIsMac();
  const undo = useEffectEvent(() => onUndo());
  const redo = useEffectEvent(() => onRedo());
  const seal = useEffectEvent(() => onSeal?.());
  // Checked before the key press is claimed, so a press in a portal is left to the browser.
  const outsideRoot = (event: KeyboardEvent) =>
    !isUndoShortcutTarget(event.target, rootRef.current);

  // The listener stays attached while there is nothing to undo, so the browser's own undo never
  // comes back inside the form's fields.
  useHotkeys(
    "mod+z",
    () => undo(),
    {
      enabled,
      enableOnFormTags: true,
      enableOnContentEditable: false,
      preventDefault: true,
      ignoreEventWhen: outsideRoot,
    },
    [enabled],
  );

  useHotkeys(
    isMac ? "mod+shift+z" : "mod+shift+z, ctrl+y",
    () => redo(),
    {
      enabled,
      enableOnFormTags: true,
      enableOnContentEditable: false,
      preventDefault: true,
      ignoreEventWhen: outsideRoot,
    },
    [enabled, isMac],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) {
      return;
    }
    const onBeforeInput = (event: Event) => {
      if (!(event instanceof InputEvent)) {
        return;
      }
      if (event.inputType === "historyUndo") {
        event.preventDefault();
        undo();
      } else if (event.inputType === "historyRedo") {
        event.preventDefault();
        redo();
      }
    };
    const onFocusOut = () => seal();
    root.addEventListener("beforeinput", onBeforeInput);
    root.addEventListener("focusout", onFocusOut);
    return () => {
      root.removeEventListener("beforeinput", onBeforeInput);
      root.removeEventListener("focusout", onFocusOut);
    };
  }, [rootRef, enabled]);
}
