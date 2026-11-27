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

/** `ignoringId` value while the bulk bar asks for a custom reason. */
export const QA_BULK_IGNORE = "bulk";

type QaSelectableFinding = {
  id: string;
  status?: string | null;
  needsRecheck?: boolean | null;
  issueIdentifier?: string | null;
};

/**
 * Splits findings into the ones that can be selected, the ones selected, and the
 * selected ones that have no issue yet. Findings stay in TanStack Query, so this
 * is a pure helper rather than a store getter.
 */
export function selectQaFindings<T extends QaSelectableFinding>(
  findings: readonly T[],
  selectedIds: ReadonlySet<string>,
) {
  const eligible = findings.filter((f) => (f.status ?? "open") === "open" && !f.needsRecheck);
  const selected = eligible.filter((f) => selectedIds.has(f.id));
  const promotable = selected.filter((f) => !f.issueIdentifier);
  return { eligible, selected, promotable };
}

/** UI state for the QA findings list: selection, whitespace toggles and the ignore form. */
export class QaFindingsTableStore {
  selectedIds = new Set<string>();
  whitespaceGroups = new Set<string>();
  /** A finding id, `QA_BULK_IGNORE`, or null when no ignore form is open. */
  ignoringId: string | null = null;
  reason = "";

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isBulkIgnoring() {
    return this.ignoringId === QA_BULK_IGNORE;
  }

  get canSubmitIgnore() {
    return this.reason.trim().length > 0;
  }

  isSelected(id: string) {
    return this.selectedIds.has(id);
  }

  isIgnoring(id: string) {
    return this.ignoringId === id;
  }

  showsWhitespace(groupId: string) {
    return this.whitespaceGroups.has(groupId);
  }

  setSelected(id: string, checked: boolean) {
    if (checked) this.selectedIds.add(id);
    else this.selectedIds.delete(id);
  }

  selectAll(ids: readonly string[]) {
    this.selectedIds = new Set(ids);
  }

  clearSelection() {
    this.selectedIds.clear();
  }

  toggleWhitespaceGroup(groupId: string) {
    if (this.whitespaceGroups.has(groupId)) this.whitespaceGroups.delete(groupId);
    else this.whitespaceGroups.add(groupId);
  }

  startIgnore(id: string) {
    this.ignoringId = id;
    this.reason = "";
  }

  startBulkIgnore() {
    this.startIgnore(QA_BULK_IGNORE);
  }

  setReason(reason: string) {
    this.reason = reason;
  }

  closeIgnore() {
    this.ignoringId = null;
    this.reason = "";
  }

  /** After a bulk ignore succeeds: the ignored rows leave the selection and the form closes. */
  finishBulkIgnore() {
    this.clearSelection();
    this.closeIgnore();
  }
}
