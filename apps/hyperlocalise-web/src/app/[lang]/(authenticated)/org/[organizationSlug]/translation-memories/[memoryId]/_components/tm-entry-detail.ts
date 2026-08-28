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
import type { MemoryEntryDetailResponse } from "@/api/routes/memory/memory.schema";
import { ApiResponseError, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

export const TM_ENTRY_DETAIL_QUERY_KEY = "translation-memory-entry-detail" as const;

export function tmEntryDetailQueryKey(
  organizationSlug: string,
  memoryId: string,
  entryId: string,
) {
  return [TM_ENTRY_DETAIL_QUERY_KEY, organizationSlug, memoryId, entryId] as const;
}

export function isStaleMemoryEntryError(error: unknown): boolean {
  return error instanceof ApiResponseError && error.code === "stale_memory_entry";
}

export async function fetchTmEntryDetail(input: {
  organizationSlug: string;
  memoryId: string;
  entryId: string;
  signal?: AbortSignal;
  fallbackMessage: string;
}): Promise<MemoryEntryDetailResponse> {
  const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
    ":memoryId"
  ].entries[":entryId"].$get(
    {
      param: {
        organizationSlug: input.organizationSlug,
        memoryId: input.memoryId,
        entryId: input.entryId,
      },
    },
    { init: { signal: input.signal } },
  );

  if (!response.ok) {
    throw await readApiResponseError(response, input.fallbackMessage);
  }

  return (await response.json()) as MemoryEntryDetailResponse;
}
