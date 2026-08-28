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
import { describe, expect, it, vi } from "vite-plus/test";

import { ApiResponseError } from "@/lib/api-error";

import {
    fetchTmEntrySearchPage,
    isAbortError,
    isInvalidCursorError,
    shouldApplyTmEntrySearchResult,
} from "./tm-entry-search";

const { getEntriesMock } = vi.hoisted(() => ({
    getEntriesMock: vi.fn(),
}));

vi.mock("@/lib/api-client-instance", () => ({
    apiClient: {
        api: {
            orgs: {
                ":organizationSlug": {
                    "translation-memories": {
                        ":memoryId": {
                            entries: {
                                $get: getEntriesMock,
                            },
                        },
                    },
                },
            },
        },
    },
}));

describe("tm-entry-search", () => {
    it("passes the abort signal and current query to the list API", async () => {
        const signal = new AbortController().signal;
        getEntriesMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                memoryEntries: [],
                nextCursor: null,
                total: 0,
                pagination: { limit: 50, returned: 0, hasMore: false },
            }),
        });

        await fetchTmEntrySearchPage({
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

        expect(getEntriesMock).toHaveBeenCalledWith(
            {
                param: { organizationSlug: "acme", memoryId: "mem_1" },
                query: {
                    limit: "50",
                    search: "invoice",
                    sourceLocale: "en-US",
                },
            },
            { init: { signal } },
        );
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
                new ApiResponseError("Unable to load entries", {
                    code: "memory_not_found",
                    status: 404,
                }),
            ),
        ).toBe(false);
    });
});
