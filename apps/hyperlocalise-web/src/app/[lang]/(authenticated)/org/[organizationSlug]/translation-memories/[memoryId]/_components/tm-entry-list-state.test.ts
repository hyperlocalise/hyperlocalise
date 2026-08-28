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
// @vitest-environment happy-dom

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
import { describe, expect, it } from "vite-plus/test";

import { COMMON_LOCALES } from "@/lib/i18n/locales";

import {
  applyTmEntryListStatePatch,
  buildTmEntryListHref,
  buildTmEntryListSearchParams,
  buildTmEntryLocaleOptions,
  clearTmEntryListFilters,
  getActiveTmEntryFilterChips,
  modifiedDateToApiDateTime,
  parseTmEntryListSearchParams,
  readTmEntryCursorStack,
  tmEntryListStateToApiQuery,
  writeTmEntryCursorStack,
  type TmEntryListUrlState,
} from "./tm-entry-list-state";

const FULL_STATE: TmEntryListUrlState = {
  search: "checkout",
  sourceLocale: "en-US",
  targetLocale: "fr-FR",
  reviewStatus: "pending",
  origin: "import",
  provider: "crowdin",
  createdByUserId: "11111111-1111-4111-8111-111111111111",
  modifiedFrom: "2026-01-01",
  modifiedTo: "2026-01-31",
  importBatchId: "22222222-2222-4222-8222-222222222222",
  sort: "updated_at",
  sortDir: "asc",
  cursor: "cursor.token",
  entry: "33333333-3333-4333-8333-333333333333",
};

describe("tm-entry-list-state", () => {
  it("parses and rebuilds explorer query state from the URL", () => {
    const params = buildTmEntryListSearchParams(FULL_STATE);
    const restored = parseTmEntryListSearchParams(params);

    expect(restored).toEqual(FULL_STATE);
    expect(buildTmEntryListHref("/org/acme/translation-memories/mem_1", restored)).toBe(
      `/org/acme/translation-memories/mem_1?${params.toString()}`,
    );
  });

  it("omits default sort values from the URL", () => {
    const params = buildTmEntryListSearchParams({
      search: "",
      sort: "created_at",
      sortDir: "desc",
    });

    expect(params.toString()).toBe("");
  });

  it("ignores invalid enum, locale-empty, and non-uuid values", () => {
    const restored = parseTmEntryListSearchParams(
      new URLSearchParams({
        reviewStatus: "published",
        sort: "source_text",
        sortDir: "sideways",
        createdByUserId: "not-a-uuid",
        importBatchId: "also-not",
        entry: "nope",
        modifiedFrom: "yesterday",
        sourceLocale: "  ",
      }),
    );

    expect(restored).toEqual({
      search: "",
      sort: "created_at",
      sortDir: "desc",
    });
  });

  it("canonicalizes locale query values", () => {
    const restored = parseTmEntryListSearchParams(
      new URLSearchParams({
        sourceLocale: "en-us",
        targetLocale: "fr-fr",
      }),
    );

    expect(restored.sourceLocale).toBe("en-US");
    expect(restored.targetLocale).toBe("fr-FR");
  });

  it("resets the cursor when filters or sort change", () => {
    const withSearch = applyTmEntryListStatePatch(FULL_STATE, { search: "invoice" });
    expect(withSearch.cursor).toBeUndefined();
    expect(withSearch.search).toBe("invoice");

    const withSort = applyTmEntryListStatePatch(FULL_STATE, { sort: "created_at" });
    expect(withSort.cursor).toBeUndefined();

    const withEntry = applyTmEntryListStatePatch(FULL_STATE, {
      entry: "44444444-4444-4444-8444-444444444444",
    });
    expect(withEntry.cursor).toBe("cursor.token");

    const withCursor = applyTmEntryListStatePatch(FULL_STATE, { cursor: "next.token" });
    expect(withCursor.cursor).toBe("next.token");
    expect(withCursor.search).toBe("checkout");
  });

  it("clears filters without dropping the selected entry or sort", () => {
    const cleared = clearTmEntryListFilters(FULL_STATE);

    expect(cleared).toEqual({
      search: "",
      sort: "updated_at",
      sortDir: "asc",
      entry: FULL_STATE.entry,
    });
    expect(getActiveTmEntryFilterChips(cleared)).toEqual([]);
  });

  it("maps explorer state to the cursor-paginated API query", () => {
    expect(tmEntryListStateToApiQuery(FULL_STATE)).toEqual({
      limit: "50",
      cursor: "cursor.token",
      search: "checkout",
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      reviewStatus: "pending",
      origin: "import",
      provider: "crowdin",
      createdByUserId: "11111111-1111-4111-8111-111111111111",
      modifiedFrom: "2026-01-01T00:00:00.000Z",
      modifiedTo: "2026-01-31T23:59:59.999Z",
      importBatchId: "22222222-2222-4222-8222-222222222222",
      sort: "updated_at",
      sortDir: "asc",
    });

    expect(tmEntryListStateToApiQuery(FULL_STATE, { limit: 25, cursor: null })).toEqual({
      limit: "25",
      search: "checkout",
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      reviewStatus: "pending",
      origin: "import",
      provider: "crowdin",
      createdByUserId: "11111111-1111-4111-8111-111111111111",
      modifiedFrom: "2026-01-01T00:00:00.000Z",
      modifiedTo: "2026-01-31T23:59:59.999Z",
      importBatchId: "22222222-2222-4222-8222-222222222222",
      sort: "updated_at",
      sortDir: "asc",
    });
  });

  it("builds locale options from the canonical catalog and memory coverage", () => {
    const options = buildTmEntryLocaleOptions({
      localeCoverage: ["vi-VN", "en-us"],
      selected: "sw-KE",
    });

    expect(options).toContain("en-US");
    expect(options).toContain("vi-VN");
    expect(options).toContain("sw-KE");
    expect(options).toEqual(expect.arrayContaining([...COMMON_LOCALES]));
    expect(options).not.toContain("ja");
  });

  it("persists and restores the cursor walk stack", () => {
    const key = "tm-entry-explorer-cursors:test";
    writeTmEntryCursorStack(key, ["", "cursor-2"]);
    expect(readTmEntryCursorStack(key)).toEqual(["", "cursor-2"]);
    expect(readTmEntryCursorStack("missing")).toEqual([]);
  });

  it("converts date-only bounds to inclusive ISO datetimes", () => {
    expect(modifiedDateToApiDateTime("2026-08-01", "start")).toBe("2026-08-01T00:00:00.000Z");
    expect(modifiedDateToApiDateTime("2026-08-01", "end")).toBe("2026-08-01T23:59:59.999Z");
    expect(modifiedDateToApiDateTime("2026-08-01T12:00:00.000Z", "start")).toBe(
      "2026-08-01T12:00:00.000Z",
    );
  });
});
