import { describe, expect, it } from "vite-plus/test";

import {
  buildCrowdinFileQueueCroql,
  buildCrowdinFileSearchCroql,
  escapeCrowdinCroqlString,
} from "./crowdin-croql";

describe("buildCrowdinFileQueueCroql", () => {
  it("scopes untranslated segments to a file and target locale", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 101,
        targetLocale: "fr",
        queueFilter: "untranslated",
      }),
    ).toBe(
      'id of file = 101 and count of languages summary where (language = @language:"fr" and is translated) = 0',
    );
  });

  it("combines search and queue filters", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 7,
        targetLocale: "de",
        queueFilter: "reviewed",
        search: "hero",
      }),
    ).toBe(
      'id of file = 7 and (identifier contains "hero" or text contains "hero") and count of languages summary where (language = @language:"de" and is approved) > 0',
    );
  });

  it("excludes unresolved issues from needs review results", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 9,
        targetLocale: "fr",
        queueFilter: "needs_review",
      }),
    ).toBe(
      'id of file = 9 and count of languages summary where (language = @language:"fr" and is translated and not is approved) > 0 and count of comments where (has unresolved issue) = 0',
    );
  });
});

describe("buildCrowdinFileSearchCroql", () => {
  it("scopes search to a file and matches identifier or text", () => {
    expect(buildCrowdinFileSearchCroql(101, "hello")).toBe(
      'id of file = 101 and (identifier contains "hello" or text contains "hello")',
    );
  });

  it("escapes quotes and backslashes in search terms", () => {
    expect(escapeCrowdinCroqlString(String.raw`say "hi"`)).toBe(String.raw`say \"hi\"`);
    expect(buildCrowdinFileSearchCroql(42, String.raw`path\to\key`)).toBe(
      String.raw`id of file = 42 and (identifier contains "path\\to\\key" or text contains "path\\to\\key")`,
    );
  });

  it("trims whitespace from the search term", () => {
    expect(buildCrowdinFileSearchCroql(7, "  workspace  ")).toBe(
      'id of file = 7 and (identifier contains "workspace" or text contains "workspace")',
    );
  });
});
