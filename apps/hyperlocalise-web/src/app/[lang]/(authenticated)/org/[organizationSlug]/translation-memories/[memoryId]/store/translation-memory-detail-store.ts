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

import {
  readTmEntryCursorStack,
  writeTmEntryCursorStack,
} from "../_components/tm-entry-list-state";

export type TmEntryForm = {
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  targetText: string;
};

export function emptyTmEntryForm(): TmEntryForm {
  return {
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    sourceText: "",
    targetText: "",
  };
}

export class TranslationMemoryDetailStore {
  readonly organizationSlug: string;
  readonly memoryId: string;
  entryForm: TmEntryForm = emptyTmEntryForm();
  selectedProjectId = "";
  addEntryOpen = false;
  projectsOpen = false;
  importHistoryOpen = false;
  selectedEntryIds: string[] = [];
  confirmBulkDeleteOpen = false;
  cursorNotice: string | null = null;
  startInEditMode = false;
  cursorStack: string[] = [];

  constructor(organizationSlug: string, memoryId: string) {
    this.organizationSlug = organizationSlug;
    this.memoryId = memoryId;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get canSubmitEntry() {
    return (
      this.entryForm.sourceText.trim().length > 0 &&
      this.entryForm.targetText.trim().length > 0 &&
      this.entryForm.sourceLocale.trim().length > 0 &&
      this.entryForm.targetLocale.trim().length > 0
    );
  }

  setEntryForm(entryForm: TmEntryForm) {
    this.entryForm = entryForm;
  }

  patchEntryForm(patch: Partial<TmEntryForm>) {
    this.entryForm = { ...this.entryForm, ...patch };
  }

  resetEntryForm() {
    this.entryForm = emptyTmEntryForm();
  }

  setAddEntryOpen(open: boolean) {
    this.addEntryOpen = open;
    if (!open) {
      this.entryForm = emptyTmEntryForm();
    }
  }

  openAddEntry() {
    this.addEntryOpen = true;
  }

  setSelectedProjectId(selectedProjectId: string) {
    this.selectedProjectId = selectedProjectId;
  }

  clearSelectedProject() {
    this.selectedProjectId = "";
  }

  setProjectsOpen(open: boolean) {
    this.projectsOpen = open;
  }

  setImportHistoryOpen(open: boolean) {
    this.importHistoryOpen = open;
  }

  setSelectedEntryIds(selectedEntryIds: string[]) {
    this.selectedEntryIds = selectedEntryIds;
  }

  toggleEntryId(entryId: string, selected: boolean) {
    if (selected) {
      if (this.selectedEntryIds.includes(entryId)) {
        return;
      }
      this.selectedEntryIds = [...this.selectedEntryIds, entryId];
      return;
    }
    this.selectedEntryIds = this.selectedEntryIds.filter((id) => id !== entryId);
  }

  setVisibleSelection(visibleEntryIds: string[], selected: boolean) {
    this.selectedEntryIds = selected ? visibleEntryIds : [];
  }

  clearSelection() {
    this.selectedEntryIds = [];
  }

  setConfirmBulkDeleteOpen(open: boolean) {
    this.confirmBulkDeleteOpen = open;
  }

  setCursorNotice(cursorNotice: string | null) {
    this.cursorNotice = cursorNotice;
  }

  setStartInEditMode(startInEditMode: boolean) {
    this.startInEditMode = startInEditMode;
  }

  openEntry(options?: { edit?: boolean }) {
    this.startInEditMode = Boolean(options?.edit);
  }

  closeEntry() {
    this.startInEditMode = false;
  }

  loadCursorStack(cursorStackKey: string) {
    this.cursorStack = readTmEntryCursorStack(cursorStackKey);
    this.cursorNotice = null;
  }

  pushCursor(cursorStackKey: string, currentCursor: string) {
    this.cursorStack = [...this.cursorStack, currentCursor];
    writeTmEntryCursorStack(cursorStackKey, this.cursorStack);
  }

  popCursor(cursorStackKey: string) {
    const nextStack = this.cursorStack.slice(0, -1);
    const previous = this.cursorStack.at(-1);
    this.cursorStack = nextStack;
    writeTmEntryCursorStack(cursorStackKey, nextStack);
    return previous;
  }

  resetCursorStack(cursorStackKey: string) {
    this.cursorStack = [];
    writeTmEntryCursorStack(cursorStackKey, []);
  }
}
