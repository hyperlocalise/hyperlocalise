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
  CONTENT_EDITOR_ALL_FILES_SOURCE_PATH,
  isContentEditorAllFilesSourcePath,
  normalizeCatSourcePathParam,
  parseCatSourcePathsFilter,
  serializeCatSourcePathsFilter,
  supportsContentEditorAllFilesProvider,
} from "./content-editor-all-files";

describe("content-editor-all-files", () => {
  it("detects the all-files sentinel and empty paths", () => {
    expect(isContentEditorAllFilesSourcePath(CONTENT_EDITOR_ALL_FILES_SOURCE_PATH)).toBe(true);
    expect(isContentEditorAllFilesSourcePath(null)).toBe(true);
    expect(isContentEditorAllFilesSourcePath("")).toBe(true);
    expect(isContentEditorAllFilesSourcePath("locales/en.json")).toBe(false);
  });

  it("normalizes missing paths to the all-files sentinel", () => {
    expect(normalizeCatSourcePathParam(null)).toBe(CONTENT_EDITOR_ALL_FILES_SOURCE_PATH);
    expect(normalizeCatSourcePathParam("  ")).toBe(CONTENT_EDITOR_ALL_FILES_SOURCE_PATH);
    expect(normalizeCatSourcePathParam("locales/en.json")).toBe("locales/en.json");
  });

  it("parses and serializes source path filters", () => {
    expect(parseCatSourcePathsFilter("a.json, b.json, a.json")).toEqual(["a.json", "b.json"]);
    expect(parseCatSourcePathsFilter("")).toBeNull();
    expect(serializeCatSourcePathsFilter(["a.json", "b.json"])).toBe("a.json,b.json");
    expect(serializeCatSourcePathsFilter(["a.json", null, "  ", undefined, "b.json"])).toBe(
      "a.json,b.json",
    );
  });

  it("supports native and Crowdin only for All Files", () => {
    expect(supportsContentEditorAllFilesProvider(null)).toBe(true);
    expect(supportsContentEditorAllFilesProvider(undefined)).toBe(true);
    expect(supportsContentEditorAllFilesProvider("crowdin")).toBe(true);
    expect(supportsContentEditorAllFilesProvider("phrase")).toBe(false);
    expect(supportsContentEditorAllFilesProvider("lokalise")).toBe(false);
    expect(supportsContentEditorAllFilesProvider("smartling")).toBe(false);
  });
});
