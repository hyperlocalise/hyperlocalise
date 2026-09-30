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
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  buildJobsListHref,
  clearJobsListFilters,
  parseJobsListSearchParams,
  type JobsListUrlState,
} from "./jobs-list-url-state";

export function useJobsListUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const searchParamsKeyRef = useRef(searchParamsKey);

  const [state, setState] = useState(() =>
    parseJobsListSearchParams(new URLSearchParams(searchParamsKey)),
  );
  const [searchDraft, setSearchDraft] = useState(state.search);
  const skipNextUrlSync = useRef(false);

  useEffect(() => {
    searchParamsKeyRef.current = searchParamsKey;
    const next = parseJobsListSearchParams(new URLSearchParams(searchParamsKey));
    skipNextUrlSync.current = true;
    setState(next);
    setSearchDraft(next.search);
  }, [searchParamsKey]);

  useEffect(() => {
    if (skipNextUrlSync.current) {
      skipNextUrlSync.current = false;
      return;
    }
    const href = buildJobsListHref(
      pathname,
      state,
      new URLSearchParams(searchParamsKeyRef.current),
    );
    const currentKey = searchParamsKeyRef.current;
    const current = currentKey ? `${pathname}?${currentKey}` : pathname;
    if (href !== current) {
      router.replace(href, { scroll: false });
    }
  }, [pathname, router, state]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setState((current) =>
        current.search === searchDraft ? current : { ...current, search: searchDraft },
      );
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchDraft]);

  const updateState = useCallback((patch: Partial<JobsListUrlState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const clearFilters = useCallback(() => {
    setState((current) => clearJobsListFilters(current));
    setSearchDraft("");
  }, []);

  return {
    state,
    searchDraft,
    setSearchDraft,
    updateState,
    clearFilters,
  };
}
