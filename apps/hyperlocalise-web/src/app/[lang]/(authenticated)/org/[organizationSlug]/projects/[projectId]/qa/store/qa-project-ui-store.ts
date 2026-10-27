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
  applyQaFindingFocus,
  DEFAULT_QA_STATUS_FILTER,
  emptyQaFindingFilters,
  hasQaFindingFilters,
  QA_FILTER_ALL,
  type QaFindingFocus,
} from "@/components/qa/qa-filters-store";
import type { QaCheckPolicy } from "@/lib/qa/qa-policy";
import type { TranslationQaCheckType } from "@/lib/qa/types";

export class QaProjectUiStore {
  readonly organizationSlug: string;
  readonly projectId: string;
  locale = QA_FILTER_ALL;
  checkType = QA_FILTER_ALL;
  severity = QA_FILTER_ALL;
  status = DEFAULT_QA_STATUS_FILTER;
  tab = "findings";
  selectedRunId: string | null = null;
  draftPolicy: QaCheckPolicy | null = null;

  constructor(organizationSlug: string, projectId: string) {
    this.organizationSlug = organizationSlug;
    this.projectId = projectId;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isFiltered() {
    return hasQaFindingFilters(this);
  }

  setLocale(locale: string) {
    this.locale = locale;
  }

  setCheckType(checkType: string) {
    this.checkType = checkType;
  }

  setSeverity(severity: string) {
    this.severity = severity;
  }

  setStatus(status: string) {
    this.status = status;
  }

  setTab(tab: string) {
    this.tab = tab;
  }

  showFindingsFor(filter: QaFindingFocus) {
    applyQaFindingFocus(this, filter);
  }

  clearFindingFilters() {
    const empty = emptyQaFindingFilters();
    this.locale = empty.locale;
    this.checkType = empty.checkType;
    this.severity = empty.severity;
    this.status = empty.status;
  }

  selectLatestRun() {
    this.selectedRunId = null;
  }

  viewRun(runId: string) {
    this.selectedRunId = runId;
  }

  selectRun(runId: string, latestRunId?: string) {
    this.selectedRunId = runId === latestRunId ? null : runId;
    this.clearFindingFilters();
    this.tab = "findings";
  }

  resetAfterScanStart() {
    this.selectedRunId = null;
    this.tab = "findings";
  }

  setDraftPolicy(policy: QaCheckPolicy | null) {
    this.draftPolicy = policy;
  }

  updateRule(
    currentPolicy: QaCheckPolicy,
    check: TranslationQaCheckType,
    change: Partial<QaCheckPolicy[TranslationQaCheckType]>,
  ) {
    this.draftPolicy = {
      ...currentPolicy,
      [check]: { ...currentPolicy[check], ...change },
    };
  }

  clearDraftPolicy() {
    this.draftPolicy = null;
  }
}
