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

import {
  customLocaleFromQuery,
  GuidelineUploadPageStore,
  matchesSearchQuery,
} from "./guideline-upload-page-store";

describe("GuidelineUploadPageStore", () => {
  it("starts unassigned, or scoped to the preselected project", () => {
    const store = new GuidelineUploadPageStore("acme");
    expect(store.scope).toBe("none");
    expect(store.projectIdsToAttach).toEqual([]);
    expect(store.isGlobal).toBe(false);

    const preselected = new GuidelineUploadPageStore("acme", "project_1");
    expect(preselected.scope).toBe("selected");
    expect(preselected.projectIdsToAttach).toEqual(["project_1"]);
  });

  it("only attaches projects for the Specific scope", () => {
    const store = new GuidelineUploadPageStore("acme", "project_1");
    store.toggleProject("project_2", true);
    expect(store.projectIdsToAttach).toEqual(["project_1", "project_2"]);

    store.setScope("all");
    expect(store.isGlobal).toBe(true);
    expect(store.projectIdsToAttach).toEqual([]);
    expect(store.selectedProjectIds).toEqual(["project_1", "project_2"]);
  });

  it("toggles locales without duplicates and clears them", () => {
    const store = new GuidelineUploadPageStore("acme");
    store.toggleLocale("ja-JP", true);
    store.toggleLocale("ja-JP", true);
    store.toggleLocale("de-DE", true);
    expect(store.locales).toEqual(["ja-JP", "de-DE"]);

    store.toggleLocale("ja-JP", false);
    expect(store.locales).toEqual(["de-DE"]);

    store.clearLocales();
    expect(store.locales).toEqual([]);
  });

  it("adds a custom locale and resets the search draft", () => {
    const store = new GuidelineUploadPageStore("acme");
    store.setLocaleQuery("pt-br");
    store.addCustomLocale("pt-BR");
    expect(store.locales).toEqual(["pt-BR"]);
    expect(store.localeQuery).toBe("");
  });

  it("blocks Markdown and flags an error when Specific has no projects", () => {
    const store = new GuidelineUploadPageStore("acme");
    store.setScope("selected");

    store.startMarkdownText();
    expect(store.textDialogOpen).toBe(false);
    expect(store.showProjectRequiredError).toBe(true);

    store.toggleProject("project_1", true);
    expect(store.showProjectRequiredError).toBe(false);

    store.startMarkdownText();
    expect(store.textDialogOpen).toBe(true);
  });

  it("clears the project error when the scope changes", () => {
    const store = new GuidelineUploadPageStore("acme");
    store.setScope("selected");
    expect(store.validateScope()).toBe(false);

    store.setScope("none");
    expect(store.showProjectRequiredError).toBe(false);
    expect(store.validateScope()).toBe(true);
  });

  it("tracks the staged file", () => {
    const store = new GuidelineUploadPageStore("acme");
    expect(store.canUploadFile).toBe(false);

    store.stageFile(new File(["# Voice"], "voice.md", { type: "text/markdown" }));
    expect(store.canUploadFile).toBe(true);

    store.stageFile(null);
    expect(store.canUploadFile).toBe(false);
  });
});

describe("matchesSearchQuery", () => {
  it("matches any value case-insensitively and treats blank as a match", () => {
    expect(matchesSearchQuery("", "anything")).toBe(true);
    expect(matchesSearchQuery("  JAP ", "Japanese (Japan)", "ja-JP")).toBe(true);
    expect(matchesSearchQuery("ko", "Japanese (Japan)", "ja-JP")).toBe(false);
  });
});

describe("customLocaleFromQuery", () => {
  it("offers canonical language codes that are not already known", () => {
    expect(customLocaleFromQuery("pt-br", ["en-US"])).toBe("pt-BR");
    expect(customLocaleFromQuery("fr", ["fr-FR"])).toBe("fr");
  });

  it("ignores words, blanks, and known locales", () => {
    expect(customLocaleFromQuery("german", [])).toBeNull();
    expect(customLocaleFromQuery("   ", [])).toBeNull();
    expect(customLocaleFromQuery("ja-jp", ["ja-JP"])).toBeNull();
  });
});
