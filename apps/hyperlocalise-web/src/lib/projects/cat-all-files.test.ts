import { describe, expect, it } from "vite-plus/test";

import {
  CAT_ALL_FILES_SOURCE_PATH,
  isCatAllFilesSourcePath,
  normalizeCatSourcePathParam,
  parseCatSourcePathsFilter,
  serializeCatSourcePathsFilter,
  supportsCatAllFilesProvider,
} from "./cat-all-files";

describe("cat-all-files", () => {
  it("detects the all-files sentinel and empty paths", () => {
    expect(isCatAllFilesSourcePath(CAT_ALL_FILES_SOURCE_PATH)).toBe(true);
    expect(isCatAllFilesSourcePath(null)).toBe(true);
    expect(isCatAllFilesSourcePath("")).toBe(true);
    expect(isCatAllFilesSourcePath("locales/en.json")).toBe(false);
  });

  it("normalizes missing paths to the all-files sentinel", () => {
    expect(normalizeCatSourcePathParam(null)).toBe(CAT_ALL_FILES_SOURCE_PATH);
    expect(normalizeCatSourcePathParam("  ")).toBe(CAT_ALL_FILES_SOURCE_PATH);
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
    expect(supportsCatAllFilesProvider(null)).toBe(true);
    expect(supportsCatAllFilesProvider(undefined)).toBe(true);
    expect(supportsCatAllFilesProvider("crowdin")).toBe(true);
    expect(supportsCatAllFilesProvider("phrase")).toBe(false);
    expect(supportsCatAllFilesProvider("lokalise")).toBe(false);
    expect(supportsCatAllFilesProvider("smartling")).toBe(false);
  });
});
