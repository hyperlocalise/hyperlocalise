/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { MemoryEntriesResponse } from "@/api/routes/memory/memory.schema";
import { ApiResponseError } from "@/lib/api-error";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";
import { parseLiveProviderMemoryId } from "@/lib/providers/jobs/tms-provider-resource-id";

import {
  tmEntryListStateToApiQuery,
  type TmEntryListApiQuery,
  type TmEntryListUrlState,
} from "./tm-entry-list-state";

export const TM_ENTRY_SEARCH_QUERY_KEY = "translation-memory-entries" as const;

export function tmEntrySearchQueryKey(
  organizationSlug: string,
  memoryId: string,
  query: TmEntryListApiQuery,
) {
  return [TM_ENTRY_SEARCH_QUERY_KEY, organizationSlug, memoryId, query] as const;
}

export function isInvalidCursorError(error: unknown): boolean {
  return (
    (error instanceof ApiResponseError || error instanceof GoSvcClientError) &&
    error.code === "invalid_cursor"
  );
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function shouldApplyTmEntrySearchResult(input: {
  requestId: number;
  latestRequestId: number;
  aborted?: boolean;
}): boolean {
  return !input.aborted && input.requestId === input.latestRequestId;
}

function emptyTmEntrySearchPage(limit: number): MemoryEntriesResponse {
  return {
    memoryEntries: [],
    nextCursor: null,
    total: 0,
    pagination: { limit, returned: 0, hasMore: false },
  };
}

export async function fetchTmEntrySearchPage(input: {
  client: GoSvcClient;
  organizationSlug: string;
  memoryId: string;
  state: TmEntryListUrlState;
  cursor?: string | null;
  signal?: AbortSignal;
  fallbackMessage: string;
}): Promise<MemoryEntriesResponse> {
  const query = tmEntryListStateToApiQuery(input.state, { cursor: input.cursor });
  if (parseLiveProviderMemoryId(input.memoryId)) {
    return emptyTmEntrySearchPage(Number(query.limit));
  }

  try {
    const page = await input.client.memory.entries.list(
      input.organizationSlug,
      input.memoryId,
      {
        ...query,
        limit: Number(query.limit),
      },
      { signal: input.signal },
    );
    return page as MemoryEntriesResponse;
  } catch (error) {
    if (isAbortError(error) || error instanceof GoSvcClientError) {
      throw error;
    }
    throw new Error(goSvcErrorMessage(error, input.fallbackMessage), { cause: error });
  }
}
