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
import { useEffect, useState } from "react";

import { isEditableShortcutTarget } from "./automation-shortcut-keys";

function isRevealKey(event: KeyboardEvent): boolean {
  return event.key === "Alt" && event.code !== "AltGraph";
}

/**
 * True while Alt or Option is held outside a field. The window losing focus or
 * the key being released hides the hints, so a stuck overlay cannot linger.
 */
export function useHeldRevealKey(): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      if (event.repeat || !isRevealKey(event) || isEditableShortcutTarget(event.target)) {
        return;
      }
      event.preventDefault();
      setHeld(true);
    };
    const onUp = (event: KeyboardEvent) => {
      if (isRevealKey(event) || !event.altKey) {
        setHeld(false);
      }
    };
    const onBlur = () => setHeld(false);

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return held;
}
