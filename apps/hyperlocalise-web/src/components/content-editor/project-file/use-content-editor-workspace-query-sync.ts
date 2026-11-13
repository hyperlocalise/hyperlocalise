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
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import type {
  ContentEditorQueueFilter,
  ContentEditorQueueSort,
} from "@/components/content-editor/queue/content-editor-queue-filter";
import { applyCatWorkspaceQueryParams } from "@/lib/projects/content-editor/content-editor-workspace-query-params";
import type { ContentEditorAdvancedQueueFilter } from "@/lib/projects/content-editor/content-editor-advanced-queue-filter";

/**
 * Keeps queueFilter + queueSort + search in the URL so locale/file remounts restore them.
 */
export function useContentEditorWorkspaceQuerySync(input: {
  queueFilter: ContentEditorQueueFilter;
  queueSort: ContentEditorQueueSort;
  search: string;
  debouncedSearch: string;
  queueFilterQualifier?: string;
  queueAdvanced?: ContentEditorAdvancedQueueFilter;
}) {
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
      queueFilterQualifier: input.queueFilterQualifier ?? null,
      queueAdvanced: input.queueAdvanced ?? null,
    });
    const nextString = next.toString();
    if (nextString === searchParamsString) {
      return;
    }

    window.history.replaceState(
      null,
      "",
      `${nextString ? `${pathname}?${nextString}` : pathname}${window.location.hash}`,
    );
  }, [
    input.debouncedSearch,
    input.queueFilter,
    input.queueSort,
    input.queueFilterQualifier,
    input.queueAdvanced,
    pathname,
    searchParamsString,
  ]);
}
