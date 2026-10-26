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

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  applyReportsChange,
  buildReportsHref,
  parseReportsSearchParams,
  type ReportsUrlState,
} from "./reports-url-state";

/** The Reports page's state, read from the URL and written back to it as it changes. */
export function useReportsUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const searchParamsKeyRef = useRef(searchParamsKey);
  const [state, setState] = useState(() =>
    parseReportsSearchParams(new URLSearchParams(searchParamsKey)),
  );
  const skipNextUrlSync = useRef(false);

  useEffect(() => {
    searchParamsKeyRef.current = searchParamsKey;
    skipNextUrlSync.current = true;
    setState(parseReportsSearchParams(new URLSearchParams(searchParamsKey)));
  }, [searchParamsKey]);

  useEffect(() => {
    if (skipNextUrlSync.current) {
      skipNextUrlSync.current = false;
      return;
    }
    const href = buildReportsHref(pathname, state);
    const currentKey = searchParamsKeyRef.current;
    const current = currentKey ? `${pathname}?${currentKey}` : pathname;
    if (href !== current) router.replace(href, { scroll: false });
  }, [pathname, router, state]);

  const update = useCallback((change: Partial<ReportsUrlState>) => {
    setState((current) => applyReportsChange(current, change));
  }, []);

  return { state, update };
}
