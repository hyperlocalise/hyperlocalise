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

import { CROWDIN_GLOSSARIES_DEFAULT_ORDER, GlossariesPageStore } from "./glossaries-page-store";

describe("GlossariesPageStore", () => {
  it("tracks search as the only list filter", () => {
    const store = new GlossariesPageStore("acme");

    expect(store.hasActiveFilters).toBe(false);
    expect(store.activeFilterCount).toBe(0);

    store.setSearchQuery("  brand  ");
    expect(store.filters).toEqual({ searchQuery: "  brand  " });
    expect(store.hasActiveFilters).toBe(true);
    expect(store.activeFilterCount).toBe(1);

    store.clearFilters();
    expect(store.searchQuery).toBe("");
    expect(store.hasActiveFilters).toBe(false);
  });

  it("resets the Crowdin order and external project picker independently of search", () => {
    const store = new GlossariesPageStore("acme");
    store.setCrowdinOrderBy("name,createdAt desc");
    store.setSelectedExternalProjectId("ext_1");
    store.setSearchQuery("legal");

    store.resetExternalProjectSelection();
    expect(store.selectedExternalProjectId).toBe("");
    expect(store.crowdinOrderBy).toBe("name,createdAt desc");
    expect(store.searchQuery).toBe("legal");

    store.setCrowdinOrderBy(CROWDIN_GLOSSARIES_DEFAULT_ORDER);
    expect(store.crowdinOrderBy).toBe(CROWDIN_GLOSSARIES_DEFAULT_ORDER);
  });

  it("tracks create-dialog chrome and resets after a successful submit", () => {
    const store = new GlossariesPageStore("acme");

    store.setCreateDialogOpen(true);
    store.setCreateForm({
      name: "Legal terms",
      description: "Contract language",
      sourceLocale: "fr-FR",
      projectIds: ["project_docs"],
    });
    store.setCreateErrors({ name: "Name is required" });
    expect(store.createDialogOpen).toBe(true);

    store.setCreateDialogOpen(false);
    expect(store.createDialogOpen).toBe(false);
    expect(store.createErrors).toEqual({});
    expect(store.createForm.name).toBe("Legal terms");

    store.setCreateDialogOpen(true);
    store.setCreateErrors({ projectIds: "Select a project" });
    store.resetCreateDialog();
    expect(store.createDialogOpen).toBe(false);
    expect(store.createForm).toEqual({
      name: "",
      description: "",
      sourceLocale: "en-US",
      projectIds: [],
    });
    expect(store.createErrors).toEqual({});
  });
});
