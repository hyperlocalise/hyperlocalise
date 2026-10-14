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

import { DictionariesPageStore } from "./dictionaries-page-store";

describe("DictionariesPageStore", () => {
  it("tracks search and create-dialog chrome", () => {
    const store = new DictionariesPageStore("acme");

    store.setSearchQuery("brand");
    expect(store.searchQuery).toBe("brand");

    store.setCreateDialogOpen(true);
    store.setCreateForm({ name: "Brand names", description: "Protected terms" });
    expect(store.createDialogOpen).toBe(true);
    expect(store.createForm).toEqual({ name: "Brand names", description: "Protected terms" });

    store.setCreateErrors({ name: "Name is required" });
    store.setCreateDialogOpen(false);
    expect(store.createDialogOpen).toBe(false);
    expect(store.createErrors).toEqual({});
    expect(store.createForm).toEqual({ name: "Brand names", description: "Protected terms" });
  });

  it("resets the create dialog after a successful submit", () => {
    const store = new DictionariesPageStore("acme");
    store.setCreateDialogOpen(true);
    store.setCreateForm({ name: "Product terms", description: "" });
    store.setCreateErrors({ submit: "Insufficient permissions" });

    store.resetCreateDialog();
    expect(store.createDialogOpen).toBe(false);
    expect(store.createForm).toEqual({ name: "", description: "" });
    expect(store.createErrors).toEqual({});
  });
});
