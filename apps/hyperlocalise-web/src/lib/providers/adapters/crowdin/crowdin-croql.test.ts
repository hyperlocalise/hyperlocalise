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

  it("excludes hidden strings with not is hidden", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 101,
        targetLocale: "fr",
        queueFilter: "not_hidden",
      }),
    ).toBe("id of file = 101 and not is hidden");
  });

  it("composes not hidden with an untranslated-first status band", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 101,
        targetLocale: "fr",
        queueFilter: "not_hidden",
        statusBand: "untranslated",
      }),
    ).toBe(
      'id of file = 101 and not is hidden and count of languages summary where (language = @language:"fr" and is translated) = 0',
    );
  });

  it("filters QA issues for the target language", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 101,
        targetLocale: "fr",
        queueFilter: "qa_issues",
      }),
    ).toBe(
      'id of file = 101 and count of languages summary where (language = @language:"fr" and has qa issues) > 0',
    );
  });

  it("filters machine translations as auto-translated for the target language", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 101,
        targetLocale: "fr",
        queueFilter: "machine_translated",
      }),
    ).toBe(
      'id of file = 101 and count of languages summary where (language = @language:"fr" and is auto translated) > 0',
    );
  });

  it("filters TM, MT, and AI machine-translation subfilters", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 101,
        targetLocale: "fr",
        queueFilter: "machine_translated",
        queueFilterQualifier: "tm",
      }),
    ).toContain("is translated by tm");
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 101,
        targetLocale: "fr",
        queueFilter: "qa_issues",
        queueFilterQualifier: "spelling",
      }),
    ).toContain("has spelling qa issues");
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 101,
        targetLocale: "fr",
        queueFilter: "has_issues",
        queueFilterQualifier: "general_question",
      }),
    ).toContain('issueType = "general_question"');
  });

  it("compiles Crowdin advanced filters into CroQL", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 101,
        targetLocale: "fr",
        queueFilter: "all",
        advancedFilter: {
          addedFrom: "2026-01-01",
          addedTo: "2026-01-31",
          includeLabelMode: "include_all",
          includeLabelIds: ["3", "7"],
          stringType: "icu",
          translationStatus: "untranslated",
          comments: "with",
          screenshots: "without",
          visibility: "visible",
        },
      }),
    ).toBe(
      "id of file = 101 and added between '2026-01-01 00:00:00' and '2026-01-31 23:59:59' and count of labels where (id = 3) > 0 and count of labels where (id = 7) > 0 and type is icu and count of languages summary where (language = @language:\"fr\" and is translated) = 0 and count of comments > 0 and count of screenshots = 0 and not is hidden",
    );
  });

  it("filters strings with comments", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 101,
        targetLocale: "fr",
        queueFilter: "with_comments",
        search: "hero",
      }),
    ).toBe(
      'id of file = 101 and (identifier contains "hero" or text contains "hero") and count of comments > 0',
    );
  });

  it("composes a status band without hiding strings in All + untranslated-first", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 101,
        targetLocale: "fr",
        queueFilter: "all",
        statusBand: "untranslated",
      }),
    ).toBe(
      'id of file = 101 and count of languages summary where (language = @language:"fr" and is translated) = 0',
    );
  });

  it("composes has issues with a not-approved status band", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 9,
        targetLocale: "fr",
        queueFilter: "has_issues",
        statusBand: "needs_review",
      }),
    ).toBe(
      'id of file = 9 and count of comments where (has unresolved issue) > 0 and count of languages summary where (language = @language:"fr" and is translated and not is approved) > 0',
    );
  });

  it("does not duplicate a status band that matches the queue filter", () => {
    expect(
      buildCrowdinFileQueueCroql({
        fileId: 101,
        targetLocale: "fr",
        queueFilter: "untranslated",
        statusBand: "untranslated",
      }),
    ).toBe(
      'id of file = 101 and count of languages summary where (language = @language:"fr" and is translated) = 0 and not is hidden',
    );
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
