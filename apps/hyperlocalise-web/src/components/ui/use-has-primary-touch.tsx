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

export function useTouchPrimary() {
  const [isTouchPrimary, setIsTouchPrimary] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const controller = new AbortController();
    const { signal } = controller;

    const handleTouch = () => {
      const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const prefersTouch = window.matchMedia("(pointer: coarse)").matches;
      setIsTouchPrimary(hasTouch && prefersTouch);
    };

    const mq = window.matchMedia("(pointer: coarse)");
    mq.addEventListener("change", handleTouch, { signal });
    window.addEventListener("pointerdown", handleTouch, { signal });

    handleTouch();

    return () => controller.abort();
  }, []);

  return isTouchPrimary;
}
