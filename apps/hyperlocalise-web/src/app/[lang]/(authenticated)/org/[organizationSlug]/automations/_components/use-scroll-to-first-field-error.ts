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

import { useEffect, useRef, type RefObject } from "react";

/**
 * Brings the first field with an error into view when a save turns one up, switching to the
 * settings tab first because the fields live there. Error messages mark themselves with
 * `data-slot="field-error"`; the ref goes on the element that holds them.
 */
export function useScrollToFirstFieldError(
  errors: Record<string, string | undefined>,
  activeTab: string,
  showSettingsTab: (tab: "settings") => void,
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (Object.values(errors).some(Boolean)) {
      pendingRef.current = true;
      showSettingsTab("settings");
    }
  }, [errors, showSettingsTab]);

  useEffect(() => {
    if (!pendingRef.current || activeTab !== "settings") {
      return;
    }
    pendingRef.current = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    containerRef.current
      ?.querySelector("[data-slot=field-error]")
      ?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
  }, [errors, activeTab]);

  return containerRef;
}
