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
  buildCrowdinFileQueueCroql,
  buildCrowdinFileSearchCroql,
  CROWDIN_CROQL_MAX_ENCODED_LENGTH,
  escapeCrowdinCroqlString,
  getCrowdinCroqlEncodedLength,
  isCrowdinCroqlWithinLimit,
} from "./crowdin-api";

describe("buildCrowdinFileQueueCroql", () => {
  it("scopes untranslated segments to a file and target locale", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 101,
        targetLocale: "fr",
        queueFilter: "untranslated",
      }),
    ).toBe(
      'id of file = 101 and count of languages summary where (language = @language:"fr" and is translated) = 0 and not is hidden',
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

  it("builds project-wide croql without a file scope", () => {
    expect(
      buildCrowdinFileQueueCroql({
        targetLocale: "fr",
        queueFilter: "untranslated",
      }),
    ).toBe(
      'count of languages summary where (language = @language:"fr" and is translated) = 0 and not is hidden',
    );
  });

  it("scopes to multiple file ids with or", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileIds: [10, 20],
        targetLocale: "fr",
        queueFilter: "all",
      }),
    ).toBe("(id of file = 10 or id of file = 20)");
  });

  it("returns undefined when there are no filters", () => {
    expect(
      buildCrowdinFileQueueCroql({
        targetLocale: "fr",
        queueFilter: "all",
      }),
    ).toBeUndefined();
  });

  it("filters hidden strings with is hidden", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 101,
        targetLocale: "fr",
        queueFilter: "hidden",
      }),
    ).toBe("id of file = 101 and is hidden");
  });
});

describe("Crowdin CROQL size limits", () => {
  it("reports encoded length and accepts queries under the soft cap", () => {
    const croql = "id of file = 1";
    expect(getCrowdinCroqlEncodedLength(croql)).toBe(encodeURIComponent(croql).length);
    expect(isCrowdinCroqlWithinLimit(croql)).toBe(true);
  });

  it("rejects multi-file OR queries that exceed the encoded soft cap", () => {
    const fileIds = Array.from({ length: 250 }, (_, index) => 100_000 + index);
    const croql = buildCrowdinFileQueueCroql({
      fileIds,
      targetLocale: "fr",
      queueFilter: "all",
    });

    expect(croql).toBeDefined();
    expect(getCrowdinCroqlEncodedLength(croql!)).toBeGreaterThan(CROWDIN_CROQL_MAX_ENCODED_LENGTH);
    expect(isCrowdinCroqlWithinLimit(croql!)).toBe(false);
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
