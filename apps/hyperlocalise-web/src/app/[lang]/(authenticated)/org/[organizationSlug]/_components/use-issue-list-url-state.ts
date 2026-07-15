"use client";

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

  const [state, setState] = useState(() =>
    parseIssueListSearchParams(new URLSearchParams(searchParamsKey), { includeProject }),
  );
  const [searchDraft, setSearchDraft] = useState(state.search);
  const skipNextUrlSync = useRef(false);

  useEffect(() => {
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
    const current = searchParamsKey ? `${pathname}?${searchParamsKey}` : pathname;
    if (href !== current) {
      router.replace(href, { scroll: false });
    }
  }, [includeProject, pathname, router, searchParamsKey, state]);

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
