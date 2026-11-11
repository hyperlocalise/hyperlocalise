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
  effectiveWorkspaceSyncFilter,
  GLOSSARY_SYNC_FILTERS,
  PROJECT_SOURCE_FILTERS,
  readWorkspaceFilterParam,
  TMS_PROVIDER_KINDS,
} from "../../_components/workspace-filter-params";

export type MemoryCreateForm = {
  name: string;
  description: string;
  importFile: File | null;
};

export type MemoryCreateErrors = {
  name?: string;
  importFile?: string;
};

export type MemoryListFilters = {
  searchQuery: string;
  sourceFilter: string;
  providerFilter: string;
  syncFilter: string;
};

export function emptyMemoryCreateForm(): MemoryCreateForm {
  return { name: "", description: "", importFile: null };
}

export class TranslationMemoriesPageStore {
  readonly organizationSlug: string;
  searchQuery = "";
  sourceFilter = "all";
  providerFilter = "all";
  syncFilter = "all";
  projectFilter = "all";
  selectedExternalProjectId = "";
  createDialogOpen = false;
  createForm: MemoryCreateForm = emptyMemoryCreateForm();
  createErrors: MemoryCreateErrors = {};

  constructor(organizationSlug: string, searchParams?: URLSearchParams) {
    this.organizationSlug = organizationSlug;
    if (searchParams) {
      this.applyUrl(searchParams);
    }
    makeAutoObservable(this, {}, { autoBind: true });
  }

  applyUrl(searchParams: URLSearchParams) {
    this.sourceFilter = readWorkspaceFilterParam(searchParams, "source", PROJECT_SOURCE_FILTERS);
    this.providerFilter = readWorkspaceFilterParam(searchParams, "provider", TMS_PROVIDER_KINDS);
    this.syncFilter = readWorkspaceFilterParam(searchParams, "sync", GLOSSARY_SYNC_FILTERS);
  }

  effectiveSyncFilter(ignoreSyncFilter: boolean) {
    return effectiveWorkspaceSyncFilter(this.syncFilter, ignoreSyncFilter);
  }

  listFilters(ignoreSyncFilter: boolean): MemoryListFilters {
    return {
      searchQuery: this.searchQuery,
      sourceFilter: this.sourceFilter,
      providerFilter: this.providerFilter,
      syncFilter: this.effectiveSyncFilter(ignoreSyncFilter),
    };
  }

  activeFilterCount(ignoreSyncFilter: boolean) {
    return [
      this.sourceFilter,
      this.providerFilter,
      this.effectiveSyncFilter(ignoreSyncFilter),
    ].filter((filter) => filter !== "all").length;
  }

  hasActiveFilters(ignoreSyncFilter: boolean) {
    return (
      this.searchQuery.trim().length > 0 ||
      this.activeFilterCount(ignoreSyncFilter) > 0 ||
      this.projectFilter !== "all"
    );
  }

  setSearchQuery(searchQuery: string) {
    this.searchQuery = searchQuery;
  }

  setSourceFilter(sourceFilter: string) {
    this.sourceFilter = sourceFilter;
  }

  setProviderFilter(providerFilter: string) {
    this.providerFilter = providerFilter;
  }

  setSyncFilter(syncFilter: string) {
    this.syncFilter = syncFilter;
  }

  setProjectFilter(projectFilter: string) {
    this.projectFilter = projectFilter;
  }

  setSelectedExternalProjectId(selectedExternalProjectId: string) {
    this.selectedExternalProjectId = selectedExternalProjectId;
  }

  resetProjectSelection() {
    this.selectedExternalProjectId = "";
    this.projectFilter = "all";
  }

  clearFilters() {
    this.searchQuery = "";
    this.sourceFilter = "all";
    this.providerFilter = "all";
    this.syncFilter = "all";
    this.projectFilter = "all";
  }

  setCreateDialogOpen(open: boolean) {
    this.createDialogOpen = open;
    if (!open) {
      this.createErrors = {};
    }
  }

  openCreateDialog() {
    this.createErrors = {};
    this.createDialogOpen = true;
  }

  setCreateForm(form: MemoryCreateForm) {
    this.createForm = form;
  }

  setCreateErrors(errors: MemoryCreateErrors) {
    this.createErrors = errors;
  }

  resetCreateDialog() {
    this.createDialogOpen = false;
    this.createForm = emptyMemoryCreateForm();
    this.createErrors = {};
  }
}
