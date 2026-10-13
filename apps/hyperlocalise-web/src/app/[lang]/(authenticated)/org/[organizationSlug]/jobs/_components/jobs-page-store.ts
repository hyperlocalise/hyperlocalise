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
  clearJobsListFilters,
  parseJobsListSearchParams,
  type JobsListStatusFilter,
  type JobsListUrlState,
} from "./jobs-list-url-state";
import { readJobsViewMode, writeJobsViewMode, type JobsViewMode } from "./jobs-view-helpers";

export class JobsPageStore {
  readonly isProject: boolean;
  state: JobsListUrlState;
  searchDraft: string;
  viewMode: JobsViewMode;
  viewModeRestored = false;

  constructor(projectId: string | undefined, searchParams: URLSearchParams) {
    this.isProject = Boolean(projectId);
    this.state = parseJobsListSearchParams(searchParams);
    this.searchDraft = this.state.search;
    this.viewMode = this.isProject ? "kanban" : "row";
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get statusFilter() {
    return this.state.status;
  }

  get isBoardView() {
    return this.isProject && this.viewMode === "kanban";
  }

  get showStatusFilter() {
    return !this.isBoardView || this.statusFilter !== "all";
  }

  restoreViewMode() {
    if (!this.isProject) return;
    this.viewMode = readJobsViewMode();
    this.viewModeRestored = true;
    if (this.isBoardView) this.setStatusFilter("all");
  }

  selectViewMode(mode: JobsViewMode) {
    if (!this.isProject) return;
    this.viewMode = mode;
    if (mode === "kanban") this.setStatusFilter("all");
    writeJobsViewMode(mode);
  }

  applyUrl(searchParams: URLSearchParams) {
    this.state = parseJobsListSearchParams(searchParams);
    this.searchDraft = this.state.search;
    if (this.viewModeRestored && this.isBoardView) this.setStatusFilter("all");
  }

  setStatusFilter(status: JobsListStatusFilter) {
    this.state = { ...this.state, status };
  }

  setSearchDraft(search: string) {
    this.searchDraft = search;
  }

  commitSearchDraft() {
    if (this.state.search !== this.searchDraft) {
      this.state = { ...this.state, search: this.searchDraft };
    }
  }

  clearFilters() {
    this.state = clearJobsListFilters(this.state);
    this.searchDraft = "";
  }
}
