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
  applyTmEntryListStatePatch,
  buildTmEntryListHref,
  clearTmEntryListFilters,
  parseTmEntryListSearchParams,
  TM_ENTRY_SEARCH_DEBOUNCE_MS,
  type TmEntryListUrlState,
} from "./tm-entry-list-state";

export function useTmEntryListUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const searchParamsKeyRef = useRef(searchParamsKey);

  const [state, setState] = useState(() =>
    parseTmEntryListSearchParams(new URLSearchParams(searchParamsKey)),
  );
  const [searchDraft, setSearchDraft] = useState(state.search);
  const skipNextUrlSync = useRef(false);

  useEffect(() => {
    searchParamsKeyRef.current = searchParamsKey;
    const next = parseTmEntryListSearchParams(new URLSearchParams(searchParamsKey));
    skipNextUrlSync.current = true;
    setState(next);
    setSearchDraft(next.search);
  }, [searchParamsKey]);

  useEffect(() => {
    if (skipNextUrlSync.current) {
      skipNextUrlSync.current = false;
      return;
    }
    const href = buildTmEntryListHref(pathname, state);
    const currentKey = searchParamsKeyRef.current;
    const current = currentKey ? `${pathname}?${currentKey}` : pathname;
    if (href !== current) {
      router.replace(href, { scroll: false });
    }
  }, [pathname, router, state]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setState((current) =>
        current.search === searchDraft
          ? current
          : applyTmEntryListStatePatch(current, { search: searchDraft }),
      );
    }, TM_ENTRY_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [searchDraft]);

  const updateState = useCallback((patch: Partial<TmEntryListUrlState>) => {
    setState((current) => applyTmEntryListStatePatch(current, patch));
  }, []);

  const clearFilters = useCallback(() => {
    setState((current) => clearTmEntryListFilters(current));
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
