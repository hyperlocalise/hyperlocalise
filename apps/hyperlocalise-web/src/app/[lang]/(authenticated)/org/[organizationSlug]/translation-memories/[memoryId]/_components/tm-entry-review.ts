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
  MemoryEntryBulkDeleteResponse,
  MemoryEntryBulkReviewResponse,
  MemoryEntryReviewSummaryResponse,
} from "@/api/routes/memory/memory.schema";
import { readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

export const TM_ENTRY_REVIEW_SUMMARY_QUERY_KEY = "translation-memory-review-summary" as const;

export function tmEntryReviewSummaryQueryKey(organizationSlug: string, memoryId: string) {
  return [TM_ENTRY_REVIEW_SUMMARY_QUERY_KEY, organizationSlug, memoryId] as const;
}

export async function fetchTmEntryReviewSummary(input: {
  organizationSlug: string;
  memoryId: string;
  signal?: AbortSignal;
  fallbackMessage: string;
}): Promise<MemoryEntryReviewSummaryResponse["reviewSummary"]> {
  const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
    ":memoryId"
  ].entries["review-summary"].$get(
    {
      param: {
        organizationSlug: input.organizationSlug,
        memoryId: input.memoryId,
      },
    },
    { init: { signal: input.signal } },
  );

  if (!response.ok) {
    throw await readApiResponseError(response, input.fallbackMessage);
  }

  const body = (await response.json()) as MemoryEntryReviewSummaryResponse;
  return body.reviewSummary;
}

export async function bulkReviewTmEntries(input: {
  organizationSlug: string;
  memoryId: string;
  entryIds: string[];
  reviewStatus: "approved" | "rejected";
  fallbackMessage: string;
}): Promise<MemoryEntryBulkReviewResponse> {
  const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
    ":memoryId"
  ].entries["bulk-review"].$post({
    param: {
      organizationSlug: input.organizationSlug,
      memoryId: input.memoryId,
    },
    json: {
      entryIds: input.entryIds,
      reviewStatus: input.reviewStatus,
    },
  });

  if (!response.ok) {
    throw await readApiResponseError(response, input.fallbackMessage);
  }

  return (await response.json()) as MemoryEntryBulkReviewResponse;
}

export async function bulkDeleteTmEntries(input: {
  organizationSlug: string;
  memoryId: string;
  entryIds: string[];
  fallbackMessage: string;
}): Promise<MemoryEntryBulkDeleteResponse> {
  const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
    ":memoryId"
  ].entries["bulk-delete"].$post({
    param: {
      organizationSlug: input.organizationSlug,
      memoryId: input.memoryId,
    },
    json: {
      entryIds: input.entryIds,
    },
  });

  if (!response.ok) {
    throw await readApiResponseError(response, input.fallbackMessage);
  }

  return (await response.json()) as MemoryEntryBulkDeleteResponse;
}
