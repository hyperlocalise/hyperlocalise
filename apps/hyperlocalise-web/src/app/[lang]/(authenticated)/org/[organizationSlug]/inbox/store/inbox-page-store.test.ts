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
import { InboxPageStore } from "./inbox-page-store";

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
    store.setFilters({ read: "unread", type: "assigned" });

    expect(store.filters).toEqual({ read: "unread", type: "assigned" });
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
});
