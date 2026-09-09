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
import { createHash } from "node:crypto";

import { describe, expect, it } from "vite-plus/test";

import {
  hashMemoryImportContent,
  sanitizeImportFilename,
  statusFromMemoryImportReport,
} from "./memory-import-attempts";
import type { MemoryImportReport } from "./tmx/tmx-types";

function report(overrides: Partial<MemoryImportReport> = {}): MemoryImportReport {
  return {
    totalRead: 1,
    created: 1,
    updated: 0,
    variantCreated: 0,
    skipped: 0,
    warned: 0,
    failed: 0,
    issues: [],
    truncatedIssues: false,
    ...overrides,
  };
}

describe("memory import attempts", () => {
  it("classifies only applied imports with failed units as partial", () => {
    expect(statusFromMemoryImportReport(report())).toBe("completed");
    expect(statusFromMemoryImportReport(report({ skipped: 2, warned: 1 }))).toBe("completed");
    expect(statusFromMemoryImportReport(report({ failed: 1 }))).toBe("partially_successful");
    expect(
      statusFromMemoryImportReport(
        report({ created: 0, updated: 0, variantCreated: 0, failed: 1 }),
      ),
    ).toBe("failed");
  });

  it("stores a canonical UTF-8 content hash and a path-free filename", () => {
    expect(hashMemoryImportContent("héllo")).toBe(
      createHash("sha256").update("héllo", "utf8").digest("hex"),
    );
    expect(sanitizeImportFilename("../folder\\memory.tmx")).toBe("memory.tmx");
    expect(sanitizeImportFilename("   ")).toBeNull();
  });
});
