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

import {
  EMPTY_CONCEPT_FILTER_DRAFT,
  GlossaryDetailPageStore,
  modifiedFromIso,
} from "./glossary-detail-page-store";

function createStore() {
  return new GlossaryDetailPageStore("acme", "glo_1");
}

describe("GlossaryDetailPageStore", () => {
  it("builds glossary and concept hrefs from the route ids", () => {
    const store = createStore();
    expect(store.glossaryHref).toBe("/org/acme/glossaries/glo_1");
    expect(store.conceptHref("con_1")).toBe("/org/acme/glossaries/glo_1/concepts/con_1");
  });

  it("resets pagination when search or sort changes", () => {
    const store = createStore();
    store.goToNextConceptPage("cursor-2");
    expect(store.conceptCursor).toBe("cursor-2");

    store.setConceptSearch("checkout");
    expect(store.conceptSearch).toBe("checkout");
    expect(store.conceptCursor).toBeUndefined();
    expect(store.conceptCursorStack).toEqual([]);

    store.goToNextConceptPage("cursor-2");
    store.toggleConceptSort();
    expect(store.conceptSort).toBe("desc");
    expect(store.conceptCursor).toBeUndefined();
  });

  it("walks concept pages forward and back", () => {
    const store = createStore();
    store.goToNextConceptPage("page-2");
    store.goToNextConceptPage("page-3");
    expect(store.conceptCursor).toBe("page-3");
    expect(store.conceptCursorStack).toEqual(["", "page-2"]);

    store.goToPreviousConceptPage();
    expect(store.conceptCursor).toBe("page-2");
    store.goToPreviousConceptPage();
    expect(store.conceptCursor).toBeUndefined();
    store.goToPreviousConceptPage();
    expect(store.conceptCursor).toBeUndefined();
  });

  it("tracks concept selection including indeterminate state", () => {
    const store = createStore();
    expect(store.conceptSelectionState(["a", "b"])).toBe(false);

    store.setConceptSelected("a", true);
    expect(store.selectedConceptIds.has("a")).toBe(true);
    expect(store.conceptSelectionState(["a", "b"])).toBe("indeterminate");

    store.selectAllConcepts(["a", "b"]);
    expect(store.areAllConceptsSelected(["a", "b"])).toBe(true);
    expect(store.conceptSelectionState(["a", "b"])).toBe(true);

    store.setConceptSelected("b", false);
    expect(store.selectedConceptIds.has("b")).toBe(false);
    store.clearConceptSelection();
    expect(store.selectedConceptIds.size).toBe(0);
  });

  it("applies filter-dialog drafts and counts active filters", () => {
    const now = Date.parse("2026-10-17T00:00:00.000Z");
    const store = createStore();
    store.openFilterDialog();
    store.updateFilterDraft("locale", "fr-FR");
    store.updateFilterDraft("modified", "24h");
    store.updateFilterDraft("linguisticStatus", "preferred");
    store.updateFilterDraft("author", "all");
    expect(store.filterDraftIsEmpty).toBe(false);

    store.applyConceptFilters(now);
    expect(store.filterDialogOpen).toBe(false);
    expect(store.conceptLocale).toBe("fr-FR");
    expect(store.conceptModified).toBe("24h");
    expect(store.conceptLinguisticStatus).toBe("preferred");
    expect(store.conceptAuthor).toBe("");
    expect(store.conceptModifiedFrom).toBe(modifiedFromIso("24h", now));
    expect(store.activeDropdownFilterCount).toBe(3);
    expect(store.activeFilterCount).toBe(3);
    expect(store.canExportFiltered).toBe(true);
    expect(store.filteredExportLocales).toEqual(["fr-FR"]);

    store.setConceptSearch("pay");
    expect(store.activeFilterCount).toBe(4);

    store.clearAllConceptFilters();
    expect(store.conceptSearch).toBe("");
    expect(store.conceptLocale).toBe("");
    expect(store.conceptModifiedFrom).toBeUndefined();
    expect(store.activeFilterCount).toBe(0);
    expect(store.canExportFiltered).toBe(false);
  });

  it("resets only the draft when clearing the filter dialog", () => {
    const store = createStore();
    store.openFilterDialog();
    store.updateFilterDraft("locale", "de-DE");
    store.applyConceptFilters();
    store.openFilterDialog();
    store.updateFilterDraft("partOfSpeech", "noun");
    store.clearFilterDraft();

    expect(store.filterDraft).toEqual(EMPTY_CONCEPT_FILTER_DRAFT);
    expect(store.conceptLocale).toBe("de-DE");
  });

  it("opens export on the filtered scope when filters are active", () => {
    const store = createStore();
    store.setConceptSearch("checkout");
    store.openExportDialog();
    expect(store.exportDialogOpen).toBe(true);
    expect(store.exportScope).toBe("filtered");

    store.setExportFormat("csv");
    expect(store.buildCompleteExportInput()).toEqual({ format: "csv", scope: "complete" });
    expect(store.buildFilteredExportInput()).toEqual({
      format: "csv",
      scope: "filtered",
      locales: [],
      search: "checkout",
      modifiedFrom: undefined,
      linguisticStatus: undefined,
      partOfSpeech: undefined,
      termType: undefined,
      gender: undefined,
      createdByUserId: undefined,
    });
  });

  it("tracks name-draft save eligibility and escape revert", () => {
    const store = createStore();
    store.syncNameDraft("Brand terms");
    expect(store.canSaveName("Brand terms")).toBe(false);

    store.setNameDraft("  Brand glossary  ");
    expect(store.trimmedNameDraft()).toBe("Brand glossary");
    expect(store.canSaveName("Brand terms")).toBe(true);

    store.revertNameDraft("Brand terms");
    expect(store.nameDraft).toBe("Brand terms");
    expect(store.consumeSkipNameBlurSave()).toBe(true);
    expect(store.consumeSkipNameBlurSave()).toBe(false);
  });

  it("resets import dialog chrome when it closes", () => {
    const store = createStore();
    const file = new File(["term"], "terms.csv", { type: "text/csv" });
    store.setImportDialogOpen(true);
    store.setImportFile(file);
    store.setImportDiagnostics([{ severity: "error", code: "bad_row", message: "Invalid" }]);

    store.setImportDialogOpen(false);
    expect(store.importDialogOpen).toBe(false);
    expect(store.importFile).toBeNull();
    expect(store.importDiagnostics).toEqual([]);
  });
});
