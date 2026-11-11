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
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { Kbd } from "@/components/ui/kbd";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";

import {
  getCatShortcutLabel,
  type ContentEditorShortcutId,
} from "./content-editor-keyboard-shortcuts";

export const SHORTCUT_HINT_HOLD_MS = 1000;

type ShortcutHintsState = {
  revealed: boolean;
  isMac: boolean;
};

const ShortcutHintsContext = createContext<ShortcutHintsState>({ revealed: false, isMac: false });

/**
 * Reveals shortcut badges while ⌘ (Mac) or Ctrl is held on its own. Pressing
 * any other key cancels, so ordinary chords never flash the badges.
 */
export function ContentEditorShortcutHintsProvider({ children }: { children: ReactNode }) {
  const isMac = useIsMac();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const modifierKey = isMac ? "Meta" : "Control";
    let holdTimer: number | undefined;

    const cancelHold = () => {
      if (holdTimer !== undefined) {
        window.clearTimeout(holdTimer);
        holdTimer = undefined;
      }
    };
    const hide = () => {
      cancelHold();
      setRevealed(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== modifierKey) {
        hide();
        return;
      }
      if (event.repeat) {
        return;
      }
      const hasOtherModifier =
        event.shiftKey || event.altKey || (isMac ? event.ctrlKey : event.metaKey);
      if (hasOtherModifier) {
        hide();
        return;
      }
      cancelHold();
      holdTimer = window.setTimeout(() => {
        holdTimer = undefined;
        setRevealed(true);
      }, SHORTCUT_HINT_HOLD_MS);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === modifierKey) {
        hide();
      }
    };
    // ⌘-Tab and similar leave the page without delivering a keyup.
    const handleVisibilityChange = () => {
      if (document.hidden) {
        hide();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", hide);
    window.addEventListener("pointerdown", hide, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelHold();
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", hide);
      window.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isMac]);

  const value = useMemo(() => ({ revealed, isMac }), [revealed, isMac]);

  return <ShortcutHintsContext.Provider value={value}>{children}</ShortcutHintsContext.Provider>;
}

export function useContentEditorShortcutHintsRevealed() {
  return useContext(ShortcutHintsContext).revealed;
}

const PLACEMENT_CLASS = {
  corner: "-top-2 -end-2",
  /** For icon buttons in a row, where corner badges would cover the neighbour. */
  below: "top-full left-1/2 mt-1 -translate-x-1/2",
} as const;

/** Badge pinned to a `relative` parent while hints are revealed. */
export function ContentEditorShortcutHint({
  shortcut,
  placement = "corner",
  className,
}: {
  shortcut: ContentEditorShortcutId;
  placement?: keyof typeof PLACEMENT_CLASS;
  className?: string;
}) {
  const { revealed, isMac } = useContext(ShortcutHintsContext);
  if (!revealed) {
    return null;
  }

  return (
    <Kbd
      aria-hidden="true"
      data-content-editor-shortcut-hint={shortcut}
      className={cn(
        "absolute z-50 h-4 min-w-4 whitespace-nowrap rounded-[4px] bg-foreground px-1 font-mono text-[10px] leading-none text-background shadow-sm ring-1 ring-background animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none",
        PLACEMENT_CLASS[placement],
        className,
      )}
    >
      {getCatShortcutLabel(isMac, shortcut)}
    </Kbd>
  );
}
