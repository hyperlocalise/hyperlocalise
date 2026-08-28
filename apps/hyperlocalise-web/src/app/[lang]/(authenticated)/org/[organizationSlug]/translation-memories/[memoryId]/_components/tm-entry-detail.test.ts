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

import { ApiResponseError } from "@/lib/api-error";

import { isStaleMemoryEntryError, tmEntryDetailQueryKey } from "./tm-entry-detail";

describe("tm entry detail helpers", () => {
  it("builds a stable query key", () => {
    expect(tmEntryDetailQueryKey("acme", "mem_1", "entry_1")).toEqual([
      "translation-memory-entry-detail",
      "acme",
      "mem_1",
      "entry_1",
    ]);
  });

  it("detects stale edit conflicts", () => {
    expect(
      isStaleMemoryEntryError(
        new ApiResponseError("changed", { code: "stale_memory_entry", status: 409 }),
      ),
    ).toBe(true);
    expect(
      isStaleMemoryEntryError(new ApiResponseError("not found", { code: "memory_not_found", status: 404 })),
    ).toBe(false);
  });
});
