import { describe, expect, it } from "vite-plus/test";

import { buildCrowdinFileSearchCroql, escapeCrowdinCroqlString } from "./crowdin-croql";

describe("buildCrowdinFileSearchCroql", () => {
  it("scopes search to a file and matches identifier or text", () => {
    expect(buildCrowdinFileSearchCroql(101, "hello")).toBe(
      'fileId = 101 and (identifier contains "hello" or text contains "hello")',
    );
  });

  it("escapes quotes and backslashes in search terms", () => {
    expect(escapeCrowdinCroqlString(String.raw`say "hi"`)).toBe(String.raw`say \"hi\"`);
    expect(buildCrowdinFileSearchCroql(42, String.raw`path\to\key`)).toBe(
      String.raw`fileId = 42 and (identifier contains "path\\to\\key" or text contains "path\\to\\key")`,
    );
  });

  it("trims whitespace from the search term", () => {
    expect(buildCrowdinFileSearchCroql(7, "  workspace  ")).toBe(
      'fileId = 7 and (identifier contains "workspace" or text contains "workspace")',
    );
  });
});
