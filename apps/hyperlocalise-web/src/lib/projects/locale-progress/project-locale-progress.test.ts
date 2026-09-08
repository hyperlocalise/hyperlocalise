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

import { countNativeSourceWords } from "./native-project-locale-progress";
import {
  buildLocaleProgressRow,
  emptyLocaleProgressRow,
  findLocaleProgressRecord,
  localeBadgeCode,
  remainingCount,
  toProgressPercent,
} from "./project-locale-progress";

describe("countNativeSourceWords", () => {
  it("uses locale-aware segmentation instead of whitespace for Japanese", () => {
    expect(countNativeSourceWords("Hello world", "en")).toBe(2);
    expect(countNativeSourceWords("日本語の翻訳", "ja")).toBeGreaterThan(1);
  });
});

describe("toProgressPercent", () => {
  it("rounds completed work against the total", () => {
    expect(toProgressPercent(5, 34)).toBe(15);
    expect(toProgressPercent(0, 10)).toBe(0);
    expect(toProgressPercent(10, 0)).toBe(0);
  });
});

describe("remainingCount", () => {
  it("returns unfinished work without going negative", () => {
    expect(remainingCount({ total: 34, translated: 5, approved: 0 })).toBe(29);
    expect(remainingCount({ total: 5, translated: 8, approved: 0 })).toBe(0);
  });
});

describe("localeBadgeCode", () => {
  it("uses the language subtag", () => {
    expect(localeBadgeCode("vi-VN")).toBe("VI");
    expect(localeBadgeCode("fr-FR")).toBe("FR");
    expect(localeBadgeCode("zh-Hant-TW")).toBe("ZH");
  });
});

describe("findLocaleProgressRecord", () => {
  it("matches Crowdin language ids to BCP-47 tags", () => {
    const records = { vi: { translationProgress: 14 } };
    expect(findLocaleProgressRecord(records, "vi-VN")).toEqual({
      key: "vi",
      value: { translationProgress: 14 },
    });
    expect(findLocaleProgressRecord(records, "fr-FR")).toBeUndefined();
  });
});

describe("buildLocaleProgressRow", () => {
  it("derives percents from word counts when omitted", () => {
    expect(
      buildLocaleProgressRow({
        locale: "vi-VN",
        words: { total: 34, translated: 5, approved: 0 },
        phrases: { total: 8, translated: 1, approved: 0 },
      }),
    ).toEqual({
      locale: "vi-VN",
      translationProgress: 15,
      approvalProgress: 0,
      words: { total: 34, translated: 5, approved: 0 },
      phrases: { total: 8, translated: 1, approved: 0 },
      lastActivityAt: null,
    });
  });

  it("builds an empty row for a locale with no work yet", () => {
    expect(emptyLocaleProgressRow("de-DE").locale).toBe("de-DE");
    expect(emptyLocaleProgressRow("de-DE").words.total).toBe(0);
  });
});
