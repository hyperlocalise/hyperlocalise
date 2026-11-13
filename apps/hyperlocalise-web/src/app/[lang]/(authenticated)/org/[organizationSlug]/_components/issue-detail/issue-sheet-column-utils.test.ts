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
import type { IssueDetailIssue } from "./issue-detail-utils";
import {
  areCustomColumnDraftsDirty,
  buildCustomColumnDrafts,
  isIssueSheetColumnVisible,
  isMainContentCustomColumn,
  isSidebarCustomColumn,
  issueSheetColumnValueString,
  listDetailPanelColumns,
  reconcileSameIssueCustomColumnDrafts,
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
    hidden: false,
    icon: null,
    ...overrides,
  };
}

function issue(values: Record<string, unknown>): IssueDetailIssue {
  return {
    id: "issue_1",
    identifier: "WEB-1",
    title: "Issue",
    description: "",
    issueType: "general_question",
    status: "open",
    targetLocale: null,
    sourcePath: null,
    segmentId: null,
    translationKeyId: null,
    linkedCommentId: null,
    linkedAgentRunId: null,
    linkKind: null,
    linkLabel: null,
    linkUrl: null,
    templateKey: null,
    assigneeUserId: null,
    reporter: null,
    assignee: null,
    key: null,
    sourceText: null,
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    resolvedAt: null,
    values,
    isWatching: false,
  };
}

describe("issue-sheet-column-utils", () => {
  it("stringifies column values for editing", () => {
    expect(issueSheetColumnValueString(null)).toBe("");
    expect(issueSheetColumnValueString("S24")).toBe("S24");
    expect(issueSheetColumnValueString(42)).toBe("42");
  });

  it("lists detail panel columns excluding system, dedicated, and hidden fields", () => {
    const columns = listDetailPanelColumns([
      column({ key: "priority", sortOrder: 10 }),
      column({ key: "owner_note", type: "long_text", sortOrder: 20 }),
      column({ key: "context", type: "enrichment", sortOrder: 40 }),
      column({ key: "sprint", sortOrder: 30 }),
      column({ key: "hidden_field", sortOrder: 25, hidden: true }),
      column({ key: "component", layer: "system", sortOrder: 50 }),
    ]);

    expect(columns.map((entry) => entry.key)).toEqual(["sprint", "context"]);
  });

  it("treats a missing column as visible and a hidden column as not", () => {
    expect(isIssueSheetColumnVisible([], "priority")).toBe(true);
    expect(
      isIssueSheetColumnVisible([column({ key: "priority", hidden: false })], "priority"),
    ).toBe(true);
    expect(isIssueSheetColumnVisible([column({ key: "priority", hidden: true })], "priority")).toBe(
      false,
    );
  });

  it("splits long text and enrichment columns into the main content area", () => {
    expect(isMainContentCustomColumn(column({ type: "long_text" }))).toBe(true);
    expect(isMainContentCustomColumn(column({ type: "enrichment" }))).toBe(true);
    expect(isSidebarCustomColumn(column({ type: "select" }))).toBe(true);
    expect(isSidebarCustomColumn(column({ type: "long_text" }))).toBe(false);
  });

  it("detects unsaved custom column drafts", () => {
    const currentIssue = issue({ sprint: "S24", context: "Saved context" });
    const columns = [
      column({ key: "sprint", type: "select" }),
      column({ key: "notes", type: "text" }),
      column({ key: "context", type: "enrichment" }),
    ];

    expect(
      areCustomColumnDraftsDirty(currentIssue, columns, {
        notes: "Updated note",
        context: "Saved context",
      }),
    ).toBe(true);
    expect(
      areCustomColumnDraftsDirty(
        currentIssue,
        columns,
        buildCustomColumnDrafts(currentIssue, columns),
      ),
    ).toBe(false);
  });

  it("adds missing custom column drafts without clobbering local edits", () => {
    const currentIssue = issue({ notes: "Saved note", context: "Saved context" });
    const columns = [
      column({ key: "notes", type: "text" }),
      column({ key: "context", type: "enrichment" }),
    ];

    const { nextBaselineDrafts, nextDrafts } = reconcileSameIssueCustomColumnDrafts(
      currentIssue,
      columns,
      { notes: "Saved note" },
      { notes: "Edited note" },
    );

    expect(nextBaselineDrafts).toEqual({
      notes: "Saved note",
      context: "Saved context",
    });
    expect(nextDrafts).toEqual({
      notes: "Edited note",
      context: "Saved context",
    });
  });

  it("refreshes unchanged custom column drafts when the saved value changes", () => {
    const currentIssue = issue({ notes: "Newer note", context: "Newer context" });
    const columns = [
      column({ key: "notes", type: "text" }),
      column({ key: "context", type: "enrichment" }),
    ];
    const staleDrafts = { notes: "Saved note", context: "Saved context" };

    expect(areCustomColumnDraftsDirty(currentIssue, columns, staleDrafts)).toBe(true);

    const { nextBaselineDrafts, nextDrafts } = reconcileSameIssueCustomColumnDrafts(
      currentIssue,
      columns,
      staleDrafts,
      { notes: "Saved note", context: "Edited context" },
    );

    expect(nextBaselineDrafts).toEqual({
      notes: "Newer note",
      context: "Newer context",
    });
    expect(nextDrafts).toEqual({
      notes: "Newer note",
      context: "Edited context",
    });
    expect(areCustomColumnDraftsDirty(currentIssue, columns, nextDrafts)).toBe(true);
    expect(
      areCustomColumnDraftsDirty(currentIssue, columns, {
        notes: "Newer note",
        context: "Newer context",
      }),
    ).toBe(false);
  });

  it("keeps identical draft records when same-issue values are already current", () => {
    const currentIssue = issue({ notes: "Saved note" });
    const columns = [column({ key: "notes", type: "text" })];
    const baselineDrafts = { notes: "Saved note" };
    const currentDrafts = { notes: "Saved note" };

    const { nextBaselineDrafts, nextDrafts } = reconcileSameIssueCustomColumnDrafts(
      currentIssue,
      columns,
      baselineDrafts,
      currentDrafts,
    );

    expect(nextBaselineDrafts).toBe(baselineDrafts);
    expect(nextDrafts).toBe(currentDrafts);
  });
});
