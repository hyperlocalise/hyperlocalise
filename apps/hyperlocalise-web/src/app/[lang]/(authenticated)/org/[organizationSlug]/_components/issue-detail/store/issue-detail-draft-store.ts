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
import { makeAutoObservable } from "mobx";

import type { IssueDetailIssue } from "../issue-detail-utils";
import {
  areCustomColumnDraftsDirty,
  buildCustomColumnDrafts,
  customColumnValueFromIssue,
  isDraftableCustomColumn,
  reconcileSameIssueCustomColumnDrafts,
} from "../issue-sheet-column-utils";
import type { IssueSheetColumn } from "../issue-sheet-column-types";

export type IssueDraftBaseline = {
  issueId: string;
  title: string;
  description: string;
  ownerNote: string;
};

export type IssueDraftSavePlan =
  | { ok: false; error: "title_required" }
  | {
      ok: true;
      issueUpdates: Record<string, unknown>;
      ownerNote: string | null;
      customColumns: Array<{ columnKey: string; value: string }>;
    };

export function ownerNoteFromIssue(issue: IssueDetailIssue) {
  return typeof issue.values.owner_note === "string" ? issue.values.owner_note : "";
}

export function isIssueDraftDirty(
  issue: IssueDetailIssue,
  titleDraft: string,
  descriptionDraft: string,
  ownerNoteDraft: string,
  customColumnDrafts: Record<string, string>,
  detailColumns: IssueSheetColumn[],
) {
  return (
    titleDraft.trim() !== issue.title ||
    descriptionDraft !== issue.description ||
    ownerNoteDraft !== ownerNoteFromIssue(issue) ||
    areCustomColumnDraftsDirty(issue, detailColumns, customColumnDrafts)
  );
}

export class IssueDetailDraftStore {
  titleDraft = "";
  descriptionDraft = "";
  ownerNoteDraft = "";
  customColumnDrafts: Record<string, string> = {};
  isDeleteOpen = false;
  suppressAutoSave = false;
  hydratedIssueId: string | null = null;
  baseline: IssueDraftBaseline | null = null;
  customColumnBaseline: { issueId: string; drafts: Record<string, string> } | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setTitleDraft(titleDraft: string) {
    this.titleDraft = titleDraft;
  }

  setDescriptionDraft(descriptionDraft: string) {
    this.descriptionDraft = descriptionDraft;
  }

  setOwnerNoteDraft(ownerNoteDraft: string) {
    this.ownerNoteDraft = ownerNoteDraft;
  }

  setCustomColumnDraft(columnKey: string, value: string) {
    this.customColumnDrafts = {
      ...this.customColumnDrafts,
      [columnKey]: value,
    };
  }

  setDeleteOpen(isDeleteOpen: boolean) {
    this.isDeleteOpen = isDeleteOpen;
  }

  beginCloseConfirm() {
    this.suppressAutoSave = true;
  }

  endCloseConfirm() {
    this.suppressAutoSave = false;
  }

  syncIssue(issue: IssueDetailIssue | undefined) {
    if (!issue) {
      return;
    }

    const ownerNote = ownerNoteFromIssue(issue);
    const baseline = this.baseline;

    if (!baseline || baseline.issueId !== issue.id) {
      this.hydratedIssueId = null;
      this.baseline = {
        issueId: issue.id,
        title: issue.title,
        description: issue.description,
        ownerNote,
      };
      this.titleDraft = issue.title;
      this.descriptionDraft = issue.description;
      this.ownerNoteDraft = ownerNote;
      return;
    }

    if (this.titleDraft === baseline.title) {
      this.titleDraft = issue.title;
    }
    if (this.descriptionDraft === baseline.description) {
      this.descriptionDraft = issue.description;
    }
    if (this.ownerNoteDraft === baseline.ownerNote) {
      this.ownerNoteDraft = ownerNote;
    }
    this.baseline = {
      issueId: issue.id,
      title: issue.title,
      description: issue.description,
      ownerNote,
    };
  }

  syncCustomColumns(issue: IssueDetailIssue | undefined, detailColumns: IssueSheetColumn[]) {
    if (!issue) {
      this.hydratedIssueId = null;
      this.customColumnDrafts = {};
      this.customColumnBaseline = null;
      return;
    }

    const draftableColumns = detailColumns.filter(isDraftableCustomColumn);
    const baseline = this.customColumnBaseline;

    if (!baseline || baseline.issueId !== issue.id) {
      this.hydratedIssueId = null;
      const drafts = buildCustomColumnDrafts(issue, draftableColumns);
      this.customColumnBaseline = { issueId: issue.id, drafts };
      this.customColumnDrafts = drafts;
      return;
    }

    const reconciled = reconcileSameIssueCustomColumnDrafts(
      issue,
      draftableColumns,
      baseline.drafts,
      this.customColumnDrafts,
    );
    this.customColumnBaseline = { issueId: issue.id, drafts: reconciled.nextBaselineDrafts };
    this.customColumnDrafts = reconciled.nextDrafts;
  }

  isHydrated(issue: IssueDetailIssue, detailColumns: IssueSheetColumn[]) {
    const draftableColumns = detailColumns.filter(isDraftableCustomColumn);
    const customColumnDraftsInitialized = draftableColumns.every((column) =>
      Object.hasOwn(this.customColumnDrafts, column.key),
    );
    const baseline = this.baseline;
    const customColumnBaseline = this.customColumnBaseline;

    return (
      customColumnDraftsInitialized &&
      (this.hydratedIssueId === issue.id ||
        (baseline?.issueId === issue.id &&
          customColumnBaseline?.issueId === issue.id &&
          this.titleDraft === baseline.title &&
          this.descriptionDraft === baseline.description &&
          this.ownerNoteDraft === baseline.ownerNote &&
          draftableColumns.every(
            (column) =>
              this.customColumnDrafts[column.key] === customColumnBaseline.drafts[column.key],
          )))
    );
  }

  isDirty(issue: IssueDetailIssue, detailColumns: IssueSheetColumn[]) {
    return isIssueDraftDirty(
      issue,
      this.titleDraft,
      this.descriptionDraft,
      this.ownerNoteDraft,
      this.customColumnDrafts,
      detailColumns,
    );
  }

  markHydrated(issueId: string) {
    this.hydratedIssueId = issueId;
  }

  reportDirty(issue: IssueDetailIssue | undefined, detailColumns: IssueSheetColumn[]) {
    if (!issue) {
      this.hydratedIssueId = null;
      return false;
    }
    if (!this.isHydrated(issue, detailColumns)) {
      return false;
    }
    this.hydratedIssueId = issue.id;
    return this.isDirty(issue, detailColumns);
  }

  isHandleDirty(issue: IssueDetailIssue | undefined, detailColumns: IssueSheetColumn[]) {
    if (!issue || this.hydratedIssueId !== issue.id) {
      return false;
    }
    return this.isDirty(issue, detailColumns);
  }

  discardCustomColumnDrafts(issue: IssueDetailIssue, detailColumns: IssueSheetColumn[]) {
    this.suppressAutoSave = true;
    const drafts = buildCustomColumnDrafts(issue, detailColumns);
    this.customColumnBaseline = { issueId: issue.id, drafts };
    this.customColumnDrafts = drafts;
  }

  buildSavePlan(issue: IssueDetailIssue, detailColumns: IssueSheetColumn[]): IssueDraftSavePlan {
    const nextTitle = this.titleDraft.trim();
    if (nextTitle === "") {
      return { ok: false, error: "title_required" };
    }

    const issueUpdates: Record<string, unknown> = {};
    if (nextTitle !== issue.title) {
      issueUpdates.title = nextTitle;
    }
    if (this.descriptionDraft !== issue.description) {
      issueUpdates.description = this.descriptionDraft;
    }

    const nextOwnerNote = this.ownerNoteDraft;
    const ownerNote = nextOwnerNote !== ownerNoteFromIssue(issue) ? nextOwnerNote : null;
    const customColumns: Array<{ columnKey: string; value: string }> = [];
    for (const column of detailColumns.filter(isDraftableCustomColumn)) {
      const draft = this.customColumnDrafts[column.key];
      if (draft === undefined || draft === customColumnValueFromIssue(issue, column.key)) {
        continue;
      }
      customColumns.push({ columnKey: column.key, value: draft });
    }

    return { ok: true, issueUpdates, ownerNote, customColumns };
  }
}
