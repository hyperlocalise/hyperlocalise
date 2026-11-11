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
import { describe, expect, it, vi } from "vite-plus/test";

import { ApiResponseError } from "@/lib/api-error";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";

import {
  fetchTmEntrySearchPage,
  isAbortError,
  isInvalidCursorError,
  shouldApplyTmEntrySearchResult,
} from "./tm-entry-search";

describe("tm-entry-search", () => {
  it("passes the abort signal and current query to the list API", async () => {
    const signal = new AbortController().signal;
    const list = vi.fn().mockResolvedValue({
      memoryEntries: [],
      nextCursor: null,
      total: 0,
      pagination: { limit: 50, returned: 0, hasMore: false },
    });

    await fetchTmEntrySearchPage({
      client: { memory: { entries: { list } } } as unknown as GoSvcClient,
      organizationSlug: "acme",
      memoryId: "mem_1",
      state: {
        search: "invoice",
        sourceLocale: "en-US",
        sort: "created_at",
        sortDir: "desc",
      },
      signal,
      fallbackMessage: "Unable to load entries",
    });

    expect(list).toHaveBeenCalledWith(
      "acme",
      "mem_1",
      {
        limit: 50,
        search: "invoice",
        sourceLocale: "en-US",
      },
      { signal },
    );
  });

  it("returns an empty page for live provider memories", async () => {
    const list = vi.fn();

    await expect(
      fetchTmEntrySearchPage({
        client: { memory: { entries: { list } } } as unknown as GoSvcClient,
        organizationSlug: "acme",
        memoryId: "crowdin:tm:718373",
        state: {
          search: "",
          sort: "created_at",
          sortDir: "desc",
        },
        fallbackMessage: "Unable to load entries",
      }),
    ).resolves.toEqual({
      memoryEntries: [],
      nextCursor: null,
      total: 0,
      pagination: { limit: 50, returned: 0, hasMore: false },
    });
    expect(list).not.toHaveBeenCalled();
  });

  it("does not apply an older response after a newer request starts", () => {
    expect(
      shouldApplyTmEntrySearchResult({
        requestId: 1,
        latestRequestId: 2,
      }),
    ).toBe(false);
    expect(
      shouldApplyTmEntrySearchResult({
        requestId: 2,
        latestRequestId: 2,
      }),
    ).toBe(true);
    expect(
      shouldApplyTmEntrySearchResult({
        requestId: 2,
        latestRequestId: 2,
        aborted: true,
      }),
    ).toBe(false);
  });

  it("treats abort and invalid-cursor failures as distinct cases", () => {
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("nope"))).toBe(false);
    expect(
      isInvalidCursorError(
        new ApiResponseError("Cursor is invalid", {
          code: "invalid_cursor",
          status: 400,
        }),
      ),
    ).toBe(true);
    expect(
      isInvalidCursorError(
        new GoSvcClientError({
          code: "invalid_cursor",
          message: "Cursor is invalid",
          status: 400,
        }),
      ),
    ).toBe(true);
    expect(
      isInvalidCursorError(
        new ApiResponseError("Unable to load entries", {
          code: "memory_not_found",
          status: 404,
        }),
      ),
    ).toBe(false);
  });
});
