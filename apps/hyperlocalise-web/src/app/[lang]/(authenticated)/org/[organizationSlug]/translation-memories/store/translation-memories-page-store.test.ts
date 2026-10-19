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
// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import { TranslationMemoriesPageStore } from "./translation-memories-page-store";

describe("TranslationMemoriesPageStore", () => {
  it("reads list filters from the URL and ignores unknown values", () => {
    const store = new TranslationMemoriesPageStore(
      "acme",
      new URLSearchParams("source=native&provider=crowdin&sync=stale"),
    );
    const unknown = new TranslationMemoriesPageStore(
      "acme",
      new URLSearchParams("source=bogus&provider=memoq&sync=done"),
    );

    expect(store.sourceFilter).toBe("native");
    expect(store.providerFilter).toBe("crowdin");
    expect(store.syncFilter).toBe("stale");
    expect(store.listFilters(false)).toEqual({
      searchQuery: "",
      sourceFilter: "native",
      providerFilter: "crowdin",
      syncFilter: "stale",
    });
    expect(unknown.listFilters(false)).toEqual({
      searchQuery: "",
      sourceFilter: "all",
      providerFilter: "all",
      syncFilter: "all",
    });
  });

  it("treats live-provider lists as unfiltered by sync and counts only remaining filters", () => {
    const store = new TranslationMemoriesPageStore("acme");
    store.setSourceFilter("external_tms");
    store.setProviderFilter("phrase");
    store.setSyncFilter("error");

    expect(store.effectiveSyncFilter(true)).toBe("all");
    expect(store.activeFilterCount(true)).toBe(2);
    expect(store.activeFilterCount(false)).toBe(3);
    expect(store.listFilters(true).syncFilter).toBe("all");
  });

  it("clears search, source, provider, sync, and project filters together", () => {
    const store = new TranslationMemoriesPageStore("acme");
    store.setSearchQuery("brand");
    store.setSourceFilter("native");
    store.setProviderFilter("lokalise");
    store.setSyncFilter("synced");
    store.setProjectFilter("project_docs");
    store.setSelectedExternalProjectId("ext_1");

    expect(store.hasActiveFilters(false)).toBe(true);

    store.clearFilters();
    expect(store.searchQuery).toBe("");
    expect(store.sourceFilter).toBe("all");
    expect(store.providerFilter).toBe("all");
    expect(store.syncFilter).toBe("all");
    expect(store.projectFilter).toBe("all");
    expect(store.selectedExternalProjectId).toBe("ext_1");
    expect(store.hasActiveFilters(false)).toBe(false);
  });

  it("resets project pickers when the org or live-provider mode changes", () => {
    const store = new TranslationMemoriesPageStore("acme");
    store.setProjectFilter("project_docs");
    store.setSelectedExternalProjectId("ext_1");

    store.resetProjectSelection();
    expect(store.projectFilter).toBe("all");
    expect(store.selectedExternalProjectId).toBe("");
  });

  it("tracks create-dialog chrome and resets after a successful submit", () => {
    const store = new TranslationMemoriesPageStore("acme");
    const importFile = new File(["source,target"], "memory.csv", { type: "text/csv" });

    store.openCreateDialog();
    store.setCreateForm({ name: "Brand TM", description: "Protected terms", importFile });
    store.setCreateErrors({ name: "Name is required" });
    expect(store.createDialogOpen).toBe(true);
    expect(store.createForm.name).toBe("Brand TM");

    store.setCreateDialogOpen(false);
    expect(store.createDialogOpen).toBe(false);
    expect(store.createErrors).toEqual({});
    expect(store.createForm.name).toBe("Brand TM");

    store.setCreateDialogOpen(true);
    store.setCreateErrors({ importFile: "Unsupported format" });
    store.resetCreateDialog();
    expect(store.createDialogOpen).toBe(false);
    expect(store.createForm).toEqual({ name: "", description: "", importFile: null });
    expect(store.createErrors).toEqual({});
  });
});
