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
import type { MemoryEntriesResponse } from "@/api/routes/memory/memory.schema";
import { ApiResponseError, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

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
    return error instanceof ApiResponseError && error.code === "invalid_cursor";
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

export async function fetchTmEntrySearchPage(input: {
    organizationSlug: string;
    memoryId: string;
    state: TmEntryListUrlState;
    cursor?: string | null;
    signal?: AbortSignal;
    fallbackMessage: string;
}): Promise<MemoryEntriesResponse> {
    const query = tmEntryListStateToApiQuery(input.state, { cursor: input.cursor });
    const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
    ].entries.$get(
        {
            param: {
                organizationSlug: input.organizationSlug,
                memoryId: input.memoryId,
            },
            query,
        },
        { init: { signal: input.signal } },
    );

    if (!response.ok) {
        throw await readApiResponseError(response, input.fallbackMessage);
    }

    return (await response.json()) as MemoryEntriesResponse;
}
