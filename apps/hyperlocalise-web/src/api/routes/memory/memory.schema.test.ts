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

import { listMemoryEntriesQuerySchema } from "./memory.schema";

describe("listMemoryEntriesQuerySchema", () => {
  it("defaults to a bounded created_at desc page", () => {
    expect(listMemoryEntriesQuerySchema.parse({})).toMatchObject({
      limit: 50,
    });
  });

  it("rejects an inverted modified date range", () => {
    const parsed = listMemoryEntriesQuerySchema.safeParse({
      modifiedFrom: "2026-08-03T00:00:00.000Z",
      modifiedTo: "2026-08-01T00:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an oversized page", () => {
    expect(listMemoryEntriesQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});
