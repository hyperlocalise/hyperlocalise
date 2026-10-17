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

import { tmEntryCursorStackStorageKey } from "../_components/tm-entry-list-state";
import { emptyTmEntryForm, TranslationMemoryDetailStore } from "./translation-memory-detail-store";

describe("TranslationMemoryDetailStore", () => {
  it("tracks add-entry chrome and resets the form when the dialog closes", () => {
    const store = new TranslationMemoryDetailStore("acme", "mem_1");

    store.openAddEntry();
    store.patchEntryForm({ sourceText: "Hello", targetText: "Bonjour", sourceLocale: "en-US" });
    expect(store.addEntryOpen).toBe(true);
    expect(store.canSubmitEntry).toBe(true);

    store.setAddEntryOpen(false);
    expect(store.addEntryOpen).toBe(false);
    expect(store.entryForm).toEqual(emptyTmEntryForm());
    expect(store.canSubmitEntry).toBe(false);
  });

  it("clears the selected project after a successful attach", () => {
    const store = new TranslationMemoryDetailStore("acme", "mem_1");
    store.setProjectsOpen(true);
    store.setSelectedProjectId("proj_docs");

    expect(store.selectedProjectId).toBe("proj_docs");
    store.clearSelectedProject();
    expect(store.selectedProjectId).toBe("");
    expect(store.projectsOpen).toBe(true);
  });

  it("toggles explorer selection and replaces it with the visible page", () => {
    const store = new TranslationMemoryDetailStore("acme", "mem_1");
    store.toggleEntryId("entry_1", true);
    store.toggleEntryId("entry_2", true);
    store.toggleEntryId("entry_1", false);

    expect(store.selectedEntryIds).toEqual(["entry_2"]);

    store.setVisibleSelection(["entry_3", "entry_4"], true);
    expect(store.selectedEntryIds).toEqual(["entry_3", "entry_4"]);

    store.setVisibleSelection(["entry_3", "entry_4"], false);
    expect(store.selectedEntryIds).toEqual([]);
  });

  it("pushes and pops cursor pages against session storage", () => {
    const store = new TranslationMemoryDetailStore("acme", "mem_1");
    const cursorStackKey = tmEntryCursorStackStorageKey("mem_1", {
      search: "",
      sort: "created_at",
      sortDir: "desc",
    });

    store.pushCursor(cursorStackKey, "");
    store.pushCursor(cursorStackKey, "cursor_1");
    expect(store.cursorStack).toEqual(["", "cursor_1"]);

    expect(store.popCursor(cursorStackKey)).toBe("cursor_1");
    expect(store.cursorStack).toEqual([""]);

    store.resetCursorStack(cursorStackKey);
    expect(store.cursorStack).toEqual([]);

    store.pushCursor(cursorStackKey, "cursor_2");
    store.loadCursorStack(cursorStackKey);
    expect(store.cursorStack).toEqual(["cursor_2"]);
  });

  it("opens an entry in edit mode and clears that flag on close", () => {
    const store = new TranslationMemoryDetailStore("acme", "mem_1");
    store.openEntry({ edit: true });
    expect(store.startInEditMode).toBe(true);

    store.closeEntry();
    expect(store.startInEditMode).toBe(false);
  });
});
