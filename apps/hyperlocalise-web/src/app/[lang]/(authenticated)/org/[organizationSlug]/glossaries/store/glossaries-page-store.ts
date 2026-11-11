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

export const CROWDIN_GLOSSARIES_DEFAULT_ORDER = "createdAt desc,name";

export type GlossaryCreateForm = {
  name: string;
  description: string;
  sourceLocale: string;
  projectIds: string[];
};

export type GlossaryCreateErrors = {
  name?: string;
  projectIds?: string;
};

export type GlossaryListFilters = {
  searchQuery: string;
};

export function emptyGlossaryCreateForm(): GlossaryCreateForm {
  return {
    name: "",
    description: "",
    sourceLocale: "en-US",
    projectIds: [],
  };
}

export class GlossariesPageStore {
  readonly organizationSlug: string;
  searchQuery = "";
  crowdinOrderBy = CROWDIN_GLOSSARIES_DEFAULT_ORDER;
  selectedExternalProjectId = "";
  createDialogOpen = false;
  createForm: GlossaryCreateForm = emptyGlossaryCreateForm();
  createErrors: GlossaryCreateErrors = {};

  constructor(organizationSlug: string) {
    this.organizationSlug = organizationSlug;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get filters(): GlossaryListFilters {
    return { searchQuery: this.searchQuery };
  }

  get activeFilterCount() {
    return this.searchQuery.trim() ? 1 : 0;
  }

  get hasActiveFilters() {
    return this.activeFilterCount > 0;
  }

  setSearchQuery(searchQuery: string) {
    this.searchQuery = searchQuery;
  }

  setCrowdinOrderBy(crowdinOrderBy: string) {
    this.crowdinOrderBy = crowdinOrderBy;
  }

  setSelectedExternalProjectId(selectedExternalProjectId: string) {
    this.selectedExternalProjectId = selectedExternalProjectId;
  }

  resetExternalProjectSelection() {
    this.selectedExternalProjectId = "";
  }

  clearFilters() {
    this.searchQuery = "";
  }

  setCreateDialogOpen(open: boolean) {
    this.createDialogOpen = open;
    if (!open) {
      this.createErrors = {};
    }
  }

  setCreateForm(form: GlossaryCreateForm) {
    this.createForm = form;
  }

  setCreateErrors(errors: GlossaryCreateErrors) {
    this.createErrors = errors;
  }

  resetCreateDialog() {
    this.createDialogOpen = false;
    this.createForm = emptyGlossaryCreateForm();
    this.createErrors = {};
  }
}
