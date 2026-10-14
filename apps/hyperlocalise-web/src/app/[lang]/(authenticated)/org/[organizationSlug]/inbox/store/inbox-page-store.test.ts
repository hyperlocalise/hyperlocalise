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
import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_INBOX_LIST_FILTERS } from "../_components/inbox-list-filters";
import { EMPTY_REPLY_DRAFT, InboxPageStore } from "./inbox-page-store";

describe("InboxPageStore", () => {
  it("keeps compose draft until it is reset", () => {
    const store = new InboxPageStore("acme");
    store.setComposeDraft("Localize the hero");
    expect(store.composeDraft).toBe("Localize the hero");

    store.resetComposeDraft();
    expect(store.composeDraft).toBe("");
  });

  it("updates and clears list filters without touching the draft", () => {
    const store = new InboxPageStore("acme");
    store.setComposeDraft("Keep me");
    store.setFilters({ priority: "all", read: "unread", type: "assigned" });

    expect(store.filters).toEqual({ priority: "all", read: "unread", type: "assigned" });
    expect(store.composeDraft).toBe("Keep me");

    store.resetFilters();
    expect(store.filters).toEqual(DEFAULT_INBOX_LIST_FILTERS);
    expect(store.composeDraft).toBe("Keep me");
  });

  it("holds a pending selection until it is cleared", () => {
    const store = new InboxPageStore("acme");
    store.setPendingSelection({ kind: "conversation", id: "c-1" });
    expect(store.pendingSelection).toEqual({ kind: "conversation", id: "c-1" });

    store.setPendingSelection({ kind: "notification", id: "n-1" });
    expect(store.pendingSelection).toEqual({ kind: "notification", id: "n-1" });

    store.clearPendingSelection();
    expect(store.pendingSelection).toBeUndefined();
  });

  it("keeps reply drafts per conversation until they are reset", () => {
    const store = new InboxPageStore("acme");
    store.setReplyDraft("c-1", {
      text: "Follow up on French",
      repositoryKey: "github:acme/web",
      projectId: "proj_website",
    });
    store.setReplyDraft("c-2", { text: "German glossary" });

    expect(store.getReplyDraft("c-1")).toEqual({
      text: "Follow up on French",
      repositoryKey: "github:acme/web",
      projectId: "proj_website",
    });
    expect(store.getReplyDraft("c-2")).toEqual({
      text: "German glossary",
      repositoryKey: "",
      projectId: "",
    });
    expect(store.getReplyDraft("c-missing")).toEqual(EMPTY_REPLY_DRAFT);

    store.setReplyDraft("c-1", { text: "" });
    expect(store.getReplyDraft("c-1")).toEqual({
      text: "",
      repositoryKey: "github:acme/web",
      projectId: "proj_website",
    });

    store.resetReplyDraft("c-1");
    expect(store.getReplyDraft("c-1")).toEqual(EMPTY_REPLY_DRAFT);
    expect(store.getReplyDraft("c-2").text).toBe("German glossary");
  });

  it("drops empty reply drafts without touching compose draft", () => {
    const store = new InboxPageStore("acme");
    store.setComposeDraft("New request");
    store.setReplyDraft("c-1", { text: "Keep me", repositoryKey: "github:acme/web" });
    store.setReplyDraft("c-1", { text: "", repositoryKey: "" });

    expect(store.replyDrafts.has("c-1")).toBe(false);
    expect(store.getReplyDraft("c-1")).toEqual(EMPTY_REPLY_DRAFT);
    expect(store.composeDraft).toBe("New request");
  });
});
