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

import type { InboxSelection } from "../_components/inbox-list";
import {
  DEFAULT_INBOX_LIST_FILTERS,
  type InboxListFilters,
} from "../_components/inbox-list-filters";

export type ReplyDraft = {
  projectId: string;
  repositoryKey: string;
  text: string;
};

export const EMPTY_REPLY_DRAFT: ReplyDraft = Object.freeze({
  projectId: "",
  repositoryKey: "",
  text: "",
});

function isEmptyReplyDraft(draft: ReplyDraft) {
  return draft.text === "" && draft.repositoryKey === "" && draft.projectId === "";
}

export class InboxPageStore {
  readonly organizationSlug: string;
  composeDraft = "";
  filters: InboxListFilters = DEFAULT_INBOX_LIST_FILTERS;
  pendingSelection: InboxSelection | undefined = undefined;
  replyDrafts = new Map<string, ReplyDraft>();

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

  getReplyDraft(conversationId: string): ReplyDraft {
    return this.replyDrafts.get(conversationId) ?? EMPTY_REPLY_DRAFT;
  }

  setReplyDraft(conversationId: string, patch: Partial<ReplyDraft>) {
    const current = this.getReplyDraft(conversationId);
    const next: ReplyDraft = {
      projectId: patch.projectId ?? current.projectId,
      repositoryKey: patch.repositoryKey ?? current.repositoryKey,
      text: patch.text ?? current.text,
    };
    if (isEmptyReplyDraft(next)) {
      this.replyDrafts.delete(conversationId);
      return;
    }
    this.replyDrafts.set(conversationId, next);
  }

  resetReplyDraft(conversationId: string) {
    this.replyDrafts.delete(conversationId);
  }

  setFilters(filters: InboxListFilters) {
    this.filters = filters;
  }

  resetFilters() {
    this.filters = DEFAULT_INBOX_LIST_FILTERS;
  }

  setPendingSelection(selection: InboxSelection) {
    this.pendingSelection = selection;
  }

  clearPendingSelection() {
    this.pendingSelection = undefined;
  }
}
