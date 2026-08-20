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
import type {
  ProjectFileCatQueueFilter,
  ProjectFileCatQueueSort,
} from "@/api/routes/project/project.schema";
import {
  projectFileCatQueueFilterSchema,
  projectFileCatQueueSortSchema,
} from "@/api/routes/project/project.schema";
import type { CatQueueFilter, CatQueueSort } from "@/components/cat/queue/cat-queue-filter";
import { isServerQueueFilter } from "@/components/cat/queue/cat-queue-filter";

/** Shared CAT workspace query keys for filter + sort + segment search. */
export const catWorkspaceQueueFilterParam = "queueFilter";
export const catWorkspaceQueueSortParam = "queueSort";
export const catWorkspaceSearchParam = "search";

export function parseCatWorkspaceQueueFilterParam(
  value: string | undefined | null,
): ProjectFileCatQueueFilter | undefined {
  if (!value) {
    return undefined;
  }

  const result = projectFileCatQueueFilterSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseCatWorkspaceQueueSortParam(
  value: string | undefined | null,
): ProjectFileCatQueueSort | undefined {
  if (!value) {
    return undefined;
  }

  const result = projectFileCatQueueSortSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseCatWorkspaceSearchParam(value: string | undefined | null): string {
  return value?.trim() ? value.trim() : "";
}

export function applyCatWorkspaceQueryParams(
  params: URLSearchParams,
  input: {
    queueFilter?: CatQueueFilter | null;
    queueSort?: CatQueueSort | null;
    search?: string | null;
  },
) {
  const next = new URLSearchParams(params);

  if (input.queueFilter != null) {
    if (input.queueFilter === "all" || !isServerQueueFilter(input.queueFilter)) {
      next.delete(catWorkspaceQueueFilterParam);
    } else {
      next.set(catWorkspaceQueueFilterParam, input.queueFilter);
    }
  }

  if (input.queueSort != null) {
    if (input.queueSort === "file_order") {
      next.delete(catWorkspaceQueueSortParam);
    } else {
      next.set(catWorkspaceQueueSortParam, input.queueSort);
    }
  }

  if (input.search !== undefined) {
    const trimmed = input.search?.trim() ?? "";
    if (!trimmed) {
      next.delete(catWorkspaceSearchParam);
    } else {
      next.set(catWorkspaceSearchParam, trimmed);
    }
  }

  return next;
}

/**
 * Clone the current browser search params and apply locale/file updates while
 * preserving queueFilter + queueSort + search (and any other unrelated params).
 */
export function buildCatNavigationSearchParams(
  currentSearch: string | URLSearchParams,
  updates: Record<string, string | null | undefined>,
) {
  const params =
    typeof currentSearch === "string"
      ? new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch)
      : new URLSearchParams(currentSearch);

  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  return params;
}
