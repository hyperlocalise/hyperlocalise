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

import type { IssueDetailIssue } from "../issue-detail-utils";
import type { IssueSheetColumn } from "../issue-sheet-column-types";
import { IssueDetailDraftStore } from "./issue-detail-draft-store";

function createIssue(overrides?: Partial<IssueDetailIssue>): IssueDetailIssue {
  return {
    id: "issue_1",
    identifier: "TEST-1",
    title: "Needs context",
    description: "Original description",
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
    values: { owner_note: "Keep the brand voice." },
    isWatching: false,
    ...overrides,
  };
}

function createColumn(overrides?: Partial<IssueSheetColumn>): IssueSheetColumn {
  return {
    id: "col_notes",
    key: "notes",
    label: "Notes",
    layer: "custom",
    type: "text",
    config: {},
    sortOrder: 1,
    hidden: false,
    icon: null,
    ...overrides,
  };
}

describe("IssueDetailDraftStore", () => {
  it("hydrates drafts from a new issue and reports clean until the user edits", () => {
    const store = new IssueDetailDraftStore();
    const issue = createIssue();
    const columns = [createColumn()];

    store.syncIssue(issue);
    store.syncCustomColumns(issue, columns);

    expect(store.titleDraft).toBe("Needs context");
    expect(store.ownerNoteDraft).toBe("Keep the brand voice.");
    expect(store.customColumnDrafts.notes).toBe("");
    expect(store.reportDirty(issue, columns)).toBe(false);
    expect(store.isHandleDirty(issue, columns)).toBe(false);

    store.setTitleDraft("Needs more context");
    expect(store.reportDirty(issue, columns)).toBe(true);
    expect(store.isHandleDirty(issue, columns)).toBe(true);
  });

  it("keeps local edits when the same issue refreshes from the server", () => {
    const store = new IssueDetailDraftStore();
    const issue = createIssue();
    const columns = [createColumn({ key: "notes" })];

    store.syncIssue(issue);
    store.syncCustomColumns(issue, columns);
    store.setTitleDraft("Edited title");
    store.setCustomColumnDraft("notes", "Local note");
    store.reportDirty(issue, columns);

    const refreshed = createIssue({
      title: "Server title",
      values: { owner_note: "Keep the brand voice.", notes: "Server note" },
    });
    store.syncIssue(refreshed);
    store.syncCustomColumns(refreshed, columns);

    expect(store.titleDraft).toBe("Edited title");
    expect(store.customColumnDrafts.notes).toBe("Local note");
    expect(store.ownerNoteDraft).toBe("Keep the brand voice.");
  });

  it("resets drafts when switching issues and ignores handle dirty until hydrated", () => {
    const store = new IssueDetailDraftStore();
    const first = createIssue();
    const columns = [createColumn()];

    store.syncIssue(first);
    store.syncCustomColumns(first, columns);
    expect(store.reportDirty(first, columns)).toBe(false);
    store.setTitleDraft("Edited");
    expect(store.reportDirty(first, columns)).toBe(true);
    expect(store.isHandleDirty(first, columns)).toBe(true);

    const second = createIssue({ id: "issue_2", title: "Second issue", values: {} });
    store.syncIssue(second);
    store.syncCustomColumns(second, columns);

    expect(store.titleDraft).toBe("Second issue");
    expect(store.hydratedIssueId).toBeNull();
    expect(store.isHandleDirty(second, columns)).toBe(false);
    expect(store.reportDirty(second, columns)).toBe(false);
    expect(store.hydratedIssueId).toBe("issue_2");
  });

  it("builds a save plan from dirty fields and rejects a blank title", () => {
    const store = new IssueDetailDraftStore();
    const issue = createIssue();
    const columns = [createColumn()];

    store.syncIssue(issue);
    store.syncCustomColumns(issue, columns);
    store.setTitleDraft("   ");
    expect(store.buildSavePlan(issue, columns)).toEqual({ ok: false, error: "title_required" });

    store.setTitleDraft("Updated title");
    store.setDescriptionDraft("Updated description");
    store.setOwnerNoteDraft("Updated note");
    store.setCustomColumnDraft("notes", "Column note");

    expect(store.buildSavePlan(issue, columns)).toEqual({
      ok: true,
      issueUpdates: { title: "Updated title", description: "Updated description" },
      ownerNote: "Updated note",
      customColumns: [{ columnKey: "notes", value: "Column note" }],
    });
  });

  it("discards only custom-column drafts and suppresses auto-save", () => {
    const store = new IssueDetailDraftStore();
    const issue = createIssue({ values: { owner_note: "Keep the brand voice.", notes: "Saved" } });
    const columns = [createColumn()];

    store.syncIssue(issue);
    store.syncCustomColumns(issue, columns);
    store.setTitleDraft("Keep this title");
    store.setCustomColumnDraft("notes", "Unsaved");

    store.discardCustomColumnDrafts(issue, columns);
    expect(store.suppressAutoSave).toBe(true);
    expect(store.titleDraft).toBe("Keep this title");
    expect(store.customColumnDrafts.notes).toBe("Saved");
  });
});
