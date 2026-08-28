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

import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  decodeMemoryEntryCursor,
  encodeMemoryEntryCursor,
  hashMemoryEntryListFilters,
  MEMORY_ENTRY_CURSOR_TTL_MS,
  type MemoryEntryListFilterFields,
} from "./memory-entry-cursor";

const ENTRY_ID = "550e8400-e29b-41d4-a716-446655440000";

const filters: MemoryEntryListFilterFields = {
  search: "checkout",
  sourceLocale: "en",
  targetLocale: "es",
  sort: "created_at",
  sortDir: "desc",
};

describe("memory entry cursor", () => {
  it("round-trips a signed cursor for the same filters", () => {
    const cursor = encodeMemoryEntryCursor({
      filters,
      id: ENTRY_ID,
      sortValue: "2026-08-01T12:00:00.000Z",
    });

    const decoded = decodeMemoryEntryCursor(cursor, filters);
    expect(isOk(decoded)).toBe(true);
    if (!isOk(decoded)) {
      return;
    }

    expect(decoded.value).toMatchObject({
      v: 1,
      id: ENTRY_ID,
      sort: "created_at",
      dir: "desc",
      sortValue: "2026-08-01T12:00:00.000Z",
      filterHash: hashMemoryEntryListFilters(filters),
    });
  });

  it("round-trips a microsecond sort value", () => {
    const cursor = encodeMemoryEntryCursor({
      filters,
      id: ENTRY_ID,
      sortValue: "2026-08-01T12:00:00.123456Z",
    });

    const decoded = decodeMemoryEntryCursor(cursor, filters);
    expect(isOk(decoded)).toBe(true);
    if (!isOk(decoded)) {
      return;
    }

    expect(decoded.value.sortValue).toBe("2026-08-01T12:00:00.123456Z");
  });

  it("rejects a tampered payload", () => {
    const cursor = encodeMemoryEntryCursor({
      filters,
      id: ENTRY_ID,
      sortValue: "2026-08-01T12:00:00.000Z",
    });
    const [payload] = cursor.split(".");
    const tampered = `${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

    const decoded = decodeMemoryEntryCursor(tampered, filters);
    expect(isErr(decoded)).toBe(true);
    if (!isErr(decoded)) {
      return;
    }
    expect(decoded.error).toMatchObject({ code: "invalid_cursor", reason: "tampered" });
  });

  it("rejects an expired cursor", () => {
    const cursor = encodeMemoryEntryCursor({
      filters,
      id: ENTRY_ID,
      sortValue: "2026-08-01T12:00:00.000Z",
      issuedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const decoded = decodeMemoryEntryCursor(cursor, filters, new Date("2026-01-02T00:00:01.000Z"));
    expect(isErr(decoded)).toBe(true);
    if (!isErr(decoded)) {
      return;
    }
    expect(decoded.error.reason).toBe("expired");
    expect(MEMORY_ENTRY_CURSOR_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("rejects a cursor issued for different filters", () => {
    const cursor = encodeMemoryEntryCursor({
      filters,
      id: ENTRY_ID,
      sortValue: "2026-08-01T12:00:00.000Z",
    });

    const decoded = decodeMemoryEntryCursor(cursor, { ...filters, search: "cart" });
    expect(isErr(decoded)).toBe(true);
    if (!isErr(decoded)) {
      return;
    }
    expect(decoded.error.reason).toBe("filter_mismatch");
  });

  it("rejects a malformed cursor", () => {
    const decoded = decodeMemoryEntryCursor("not-a-cursor", filters);
    expect(isErr(decoded)).toBe(true);
    if (!isErr(decoded)) {
      return;
    }
    expect(decoded.error.reason).toBe("malformed");
  });
});
