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

export type QaWorkspaceFindingFocus = QaFindingFocus & {
  projectId?: string;
};

export class QaWorkspaceUiStore {
  readonly organizationSlug: string;
  locale = QA_FILTER_ALL;
  checkType = QA_FILTER_ALL;
  severity = QA_FILTER_ALL;
  status = DEFAULT_QA_STATUS_FILTER;
  tab = "findings";
  projectId = QA_FILTER_ALL;

  constructor(organizationSlug: string) {
    this.organizationSlug = organizationSlug;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isFiltered() {
    return hasQaFindingFilters(this) || this.projectId !== QA_FILTER_ALL;
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

  setProjectId(projectId: string) {
    this.projectId = projectId;
  }

  showFindingsFor(filter: QaWorkspaceFindingFocus) {
    if (filter.projectId) this.projectId = filter.projectId;
    applyQaFindingFocus(this, filter);
  }

  clearFilters() {
    const empty = emptyQaFindingFilters();
    this.locale = empty.locale;
    this.checkType = empty.checkType;
    this.severity = empty.severity;
    this.status = empty.status;
    this.projectId = QA_FILTER_ALL;
  }
}
