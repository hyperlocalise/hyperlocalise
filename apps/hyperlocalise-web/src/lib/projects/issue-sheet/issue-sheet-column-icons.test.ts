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
  DEFAULT_ISSUE_SHEET_COLUMN_ICON_ID,
  filterIssueSheetColumnIcons,
  isIssueSheetColumnIconId,
} from "./issue-sheet-column-icons";

describe("issue-sheet-column-icons", () => {
  it("accepts registry ids and rejects unknown values", () => {
    expect(isIssueSheetColumnIconId("calendar")).toBe(true);
    expect(isIssueSheetColumnIconId("not-an-icon")).toBe(false);
    expect(DEFAULT_ISSUE_SHEET_COLUMN_ICON_ID).toBe("tag");
  });

  it("filters the catalog by id and keywords", () => {
    expect(filterIssueSheetColumnIcons("")).toContain("tag");
    expect(filterIssueSheetColumnIcons("rocket")).toEqual(["rocket"]);
    expect(filterIssueSheetColumnIcons("locale")).toEqual(
      expect.arrayContaining(["globe", "translate"]),
    );
    expect(filterIssueSheetColumnIcons("zzzz")).toEqual([]);
  });
});
