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
  canDeleteIssueSheetColumn,
  isIssueSheetProtectedColumnKey,
} from "./issue-sheet-column-guards";

describe("issue-sheet-column-guards", () => {
  it("protects seeded column keys", () => {
    expect(isIssueSheetProtectedColumnKey("priority")).toBe(true);
    expect(isIssueSheetProtectedColumnKey("owner_note")).toBe(true);
    expect(isIssueSheetProtectedColumnKey("context")).toBe(true);
    expect(isIssueSheetProtectedColumnKey("component")).toBe(false);
  });

  it("only allows deleting custom non-seeded columns", () => {
    expect(canDeleteIssueSheetColumn({ key: "component", layer: "custom" })).toBe(true);
    expect(canDeleteIssueSheetColumn({ key: "priority", layer: "custom" })).toBe(false);
    expect(canDeleteIssueSheetColumn({ key: "context", layer: "enrichment" })).toBe(false);
  });
});
