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
  DEFAULT_INBOX_LIST_FILTERS,
  type InboxListFilters,
} from "../_components/inbox-list-filters";

export class InboxPageStore {
  readonly organizationSlug: string;
  composeDraft = "";
  filters: InboxListFilters = DEFAULT_INBOX_LIST_FILTERS;

  constructor(organizationSlug: string) {
    this.organizationSlug = organizationSlug;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setComposeDraft(draft: string) {
    this.composeDraft = draft;
  }

  resetComposeDraft() {
    this.composeDraft = "";
  }

  setFilters(filters: InboxListFilters) {
    this.filters = filters;
  }

  resetFilters() {
    this.filters = DEFAULT_INBOX_LIST_FILTERS;
  }
}
