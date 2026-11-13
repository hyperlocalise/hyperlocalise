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

import {
  memoryInterchangeHistoryFilename,
  memoryInterchangeHistorySummary,
} from "./tm-import-history-summary";

describe("memory interchange history summary", () => {
  it("names an export from its result file and shows the exported entry count", () => {
    const attempt = {
      operation: "export" as const,
      sourceFilename: null,
      resultFilename: "product-tm.tmx",
      counts: { entries: 8 },
    };

    expect(memoryInterchangeHistoryFilename(attempt)).toBe("product-tm.tmx");
    expect(memoryInterchangeHistorySummary(attempt)).toEqual({ kind: "export", entries: 8 });
  });

  it("keeps a queued export visible without import counts", () => {
    const attempt = {
      operation: "export" as const,
      sourceFilename: null,
      resultFilename: null,
      counts: null,
    };

    expect(memoryInterchangeHistoryFilename(attempt)).toBeNull();
    expect(memoryInterchangeHistorySummary(attempt)).toBeNull();
  });

  it("keeps import filenames and import counts", () => {
    const attempt = {
      operation: "import" as const,
      sourceFilename: "memory.tmx",
      resultFilename: "ignored.tmx",
      counts: {
        totalRead: 3,
        created: 2,
        updated: 1,
        variantCreated: 0,
        skipped: 0,
        warned: 0,
        failed: 0,
      },
    };

    expect(memoryInterchangeHistoryFilename(attempt)).toBe("memory.tmx");
    expect(memoryInterchangeHistorySummary(attempt)).toEqual({
      kind: "import",
      created: 2,
      updated: 1,
      failed: 0,
    });
  });
});
