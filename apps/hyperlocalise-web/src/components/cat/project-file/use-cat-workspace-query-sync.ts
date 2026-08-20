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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import type { CatQueueFilter, CatQueueSort } from "@/components/cat/queue/cat-queue-filter";
import { applyCatWorkspaceQueryParams } from "@/lib/projects/cat/cat-workspace-query-params";

/**
 * Keeps queueFilter + queueSort + search in the URL so locale/file remounts restore them.
 */
export function useCatWorkspaceQuerySync(input: {
  queueFilter: CatQueueFilter;
  queueSort: CatQueueSort;
  search: string;
  debouncedSearch: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    const next = applyCatWorkspaceQueryParams(new URLSearchParams(searchParamsString), {
      queueFilter: input.queueFilter,
      queueSort: input.queueSort,
      search: input.debouncedSearch,
    });
    const nextString = next.toString();
    if (nextString === searchParamsString) {
      return;
    }

    router.replace(nextString ? `${pathname}?${nextString}` : pathname, { scroll: false });
  }, [
    input.debouncedSearch,
    input.queueFilter,
    input.queueSort,
    pathname,
    router,
    searchParamsString,
  ]);
}
