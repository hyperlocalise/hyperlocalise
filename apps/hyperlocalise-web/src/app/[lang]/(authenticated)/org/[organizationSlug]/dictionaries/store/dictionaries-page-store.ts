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

export type DictionaryCreateForm = {
  name: string;
  description: string;
};

function emptyDictionaryCreateForm(): DictionaryCreateForm {
  return { name: "", description: "" };
}

export class DictionariesPageStore {
  readonly organizationSlug: string;
  searchQuery = "";
  createDialogOpen = false;
  createForm: DictionaryCreateForm = emptyDictionaryCreateForm();
  createErrors: { name?: string; submit?: string } = {};
  detailLocale = "en-US";
  detailWord = "";
  detailSelectedProjectId = "";

  constructor(organizationSlug: string) {
    this.organizationSlug = organizationSlug;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setSearchQuery(searchQuery: string) {
    this.searchQuery = searchQuery;
  }

  setCreateDialogOpen(open: boolean) {
    this.createDialogOpen = open;
    if (!open) {
      this.createErrors = {};
    }
  }

  setCreateForm(form: DictionaryCreateForm) {
    this.createForm = form;
  }

  setCreateErrors(errors: { name?: string; submit?: string }) {
    this.createErrors = errors;
  }

  resetCreateDialog() {
    this.createDialogOpen = false;
    this.createForm = emptyDictionaryCreateForm();
    this.createErrors = {};
  }

  setDetailLocale(locale: string) {
    this.detailLocale = locale;
  }

  setDetailWord(word: string) {
    this.detailWord = word;
  }

  clearDetailWord() {
    this.detailWord = "";
  }

  setDetailSelectedProjectId(projectId: string) {
    this.detailSelectedProjectId = projectId;
  }

  clearDetailSelectedProjectId() {
    this.detailSelectedProjectId = "";
  }
}
