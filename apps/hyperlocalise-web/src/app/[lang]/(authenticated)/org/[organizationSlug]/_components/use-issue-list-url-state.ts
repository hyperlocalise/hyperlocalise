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
  buildIssueListHref,
  clearIssueListFilters,
  defaultSortDirForField,
  parseIssueListSearchParams,
  type IssueListUrlState,
} from "./issue-list-url-state";

export function useIssueListUrlState(options?: { includeProject?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const includeProject = options?.includeProject ?? false;
  const searchParamsKey = searchParams.toString();
  const searchParamsKeyRef = useRef(searchParamsKey);

  const [state, setState] = useState(() =>
    parseIssueListSearchParams(new URLSearchParams(searchParamsKey), { includeProject }),
  );
  const [searchDraft, setSearchDraft] = useState(state.search);
  const skipNextUrlSync = useRef(false);

  useEffect(() => {
    searchParamsKeyRef.current = searchParamsKey;
    const next = parseIssueListSearchParams(new URLSearchParams(searchParamsKey), {
      includeProject,
    });
    skipNextUrlSync.current = true;
    setState(next);
    setSearchDraft(next.search);
  }, [includeProject, searchParamsKey]);

  useEffect(() => {
    if (skipNextUrlSync.current) {
      skipNextUrlSync.current = false;
      return;
    }
    const href = buildIssueListHref(pathname, state, { includeProject });
    const currentKey = searchParamsKeyRef.current;
    const current = currentKey ? `${pathname}?${currentKey}` : pathname;
    if (href !== current) {
      router.replace(href, { scroll: false });
    }
  }, [includeProject, pathname, router, state]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setState((current) =>
        current.search === searchDraft ? current : { ...current, search: searchDraft },
      );
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchDraft]);

  const updateState = useCallback((patch: Partial<IssueListUrlState>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      if (patch.sort && patch.sortDir === undefined && patch.sort !== current.sort) {
        next.sortDir = defaultSortDirForField(patch.sort);
      }
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setState((current) => clearIssueListFilters(current));
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
