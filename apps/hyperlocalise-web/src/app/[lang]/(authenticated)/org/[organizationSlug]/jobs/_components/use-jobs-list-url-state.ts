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
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { buildJobsListHref } from "./jobs-list-url-state";
import { JobsPageStore } from "./jobs-page-store";

export function useJobsListUrlState(projectId?: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const searchParamsKeyRef = useRef(searchParamsKey);
  const [store] = useState(
    () => new JobsPageStore(projectId, new URLSearchParams(searchParamsKey)),
  );

  useEffect(() => {
    searchParamsKeyRef.current = searchParamsKey;
    store.applyUrl(new URLSearchParams(searchParamsKey));
    const href = buildJobsListHref(pathname, store.state, new URLSearchParams(searchParamsKey));
    const current = searchParamsKey ? `${pathname}?${searchParamsKey}` : pathname;
    if (href !== current) router.replace(href, { scroll: false });
  }, [pathname, router, searchParamsKey, store]);

  useEffect(() => {
    store.restoreViewMode();
  }, [store]);

  useEffect(() => {
    const href = buildJobsListHref(
      pathname,
      store.state,
      new URLSearchParams(searchParamsKeyRef.current),
    );
    const currentKey = searchParamsKeyRef.current;
    const current = currentKey ? `${pathname}?${currentKey}` : pathname;
    if (href !== current) router.replace(href, { scroll: false });
  }, [pathname, router, store, store.state.search, store.state.status]);

  useEffect(() => {
    const timeout = window.setTimeout(() => store.commitSearchDraft(), 250);
    return () => window.clearTimeout(timeout);
  }, [store, store.searchDraft]);

  return store;
}
