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
"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  applyReportsChange,
  buildReportsHref,
  parseReportsSearchParams,
  type ReportsUrlState,
} from "./reports-url-state";

/**
 * The Reports page's state, read from the URL and written back to it as it changes. The URL is
 * the only copy: a change goes through the browser's `history.replaceState`, which Next follows
 * at once, so quick changes in a row each build on the last and none is undone by an earlier
 * navigation landing late.
 */
export function useReportsUrlState() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const state = useMemo(
    () => parseReportsSearchParams(new URLSearchParams(searchParamsKey)),
    [searchParamsKey],
  );

  const update = useCallback(
    (change: Partial<ReportsUrlState>) => {
      // The URL as it is now, which a change made since the last render has already updated.
      const current = parseReportsSearchParams(new URLSearchParams(window.location.search));
      const href = buildReportsHref(pathname, applyReportsChange(current, change));
      window.history.replaceState(null, "", `${href}${window.location.hash}`);
    },
    [pathname],
  );

  return { state, update };
}
