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
import type { MemoryEntryDetailResponse } from "@/api/routes/memory/memory.schema";
import { ApiResponseError } from "@/lib/api-error";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";

export const TM_ENTRY_DETAIL_QUERY_KEY = "translation-memory-entry-detail" as const;

export function tmEntryDetailQueryKey(organizationSlug: string, memoryId: string, entryId: string) {
  return [TM_ENTRY_DETAIL_QUERY_KEY, organizationSlug, memoryId, entryId] as const;
}

export function isStaleMemoryEntryError(error: unknown): boolean {
  return (
    (error instanceof ApiResponseError || error instanceof GoSvcClientError) &&
    error.code === "stale_memory_entry"
  );
}

export async function fetchTmEntryDetail(input: {
  client: GoSvcClient;
  organizationSlug: string;
  memoryId: string;
  entryId: string;
  signal?: AbortSignal;
  fallbackMessage: string;
}): Promise<MemoryEntryDetailResponse> {
  try {
    const detail = await input.client.memory.entries.get(
      input.organizationSlug,
      input.memoryId,
      input.entryId,
      { signal: input.signal },
    );
    return detail as MemoryEntryDetailResponse;
  } catch (error) {
    if (error instanceof GoSvcClientError) {
      throw error;
    }
    throw new Error(goSvcErrorMessage(error, input.fallbackMessage), { cause: error });
  }
}
