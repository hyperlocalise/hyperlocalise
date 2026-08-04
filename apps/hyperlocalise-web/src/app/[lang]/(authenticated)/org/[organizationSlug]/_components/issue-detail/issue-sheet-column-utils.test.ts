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

import type { IssueSheetColumn } from "./issue-sheet-column-types";
import {
  isMainContentCustomColumn,
  isSidebarCustomColumn,
  issueSheetColumnValueString,
  listDetailPanelColumns,
} from "./issue-sheet-column-utils";

function column(overrides: Partial<IssueSheetColumn> = {}): IssueSheetColumn {
  return {
    id: "col_1",
    key: "sprint",
    label: "Sprint",
    layer: "custom",
    type: "select",
    config: { options: [{ id: "s24", label: "Sprint 24" }] },
    sortOrder: 30,
    ...overrides,
  };
}

describe("issue-sheet-column-utils", () => {
  it("stringifies column values for editing", () => {
    expect(issueSheetColumnValueString(null)).toBe("");
    expect(issueSheetColumnValueString("S24")).toBe("S24");
    expect(issueSheetColumnValueString(42)).toBe("42");
  });

  it("lists detail panel columns excluding system and dedicated fields", () => {
    const columns = listDetailPanelColumns([
      column({ key: "priority", sortOrder: 10 }),
      column({ key: "owner_note", type: "long_text", sortOrder: 20 }),
      column({ key: "context", type: "enrichment", sortOrder: 40 }),
      column({ key: "sprint", sortOrder: 30 }),
      column({ key: "component", layer: "system", sortOrder: 50 }),
    ]);

    expect(columns.map((entry) => entry.key)).toEqual(["sprint", "context"]);
  });

  it("splits long text and enrichment columns into the main content area", () => {
    expect(isMainContentCustomColumn(column({ type: "long_text" }))).toBe(true);
    expect(isMainContentCustomColumn(column({ type: "enrichment" }))).toBe(true);
    expect(isSidebarCustomColumn(column({ type: "select" }))).toBe(true);
    expect(isSidebarCustomColumn(column({ type: "long_text" }))).toBe(false);
  });
});
