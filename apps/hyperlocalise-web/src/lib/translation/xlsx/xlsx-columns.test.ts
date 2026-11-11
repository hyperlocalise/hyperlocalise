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
  resolveXlsxHeaderColumns,
  xlsxHeaderLocale,
  xlsxHeaderSlug,
  xlsxLocaleColumn,
} from "./xlsx-columns";

describe("xlsx header rules", () => {
  it("collapses runs outside a-z and 0-9 into one dash", () => {
    expect(xlsxHeaderSlug("string length")).toBe("string-length");
    expect(xlsxHeaderSlug("en####us")).toBe("en-us");
    expect(xlsxHeaderSlug("en_gb")).toBe("en-gb");
    expect(xlsxHeaderSlug("  Chinese (Simplified)")).toBe("chinese-simplified");
    expect(xlsxHeaderSlug("\ufeffKey")).toBe("key");
  });

  it("reads locale codes and language names, case-insensitively", () => {
    expect(xlsxHeaderLocale("English")).toBe("en");
    expect(xlsxHeaderLocale("EN-us")).toBe("en-us");
    expect(xlsxHeaderLocale("Chinese (Simplified)")).toBe("zh-hans");
    expect(xlsxHeaderLocale("zh_CN")).toBe("zh-hans");
    expect(xlsxHeaderLocale("Portuguese (Brazil)")).toBe("pt-br");
    expect(xlsxHeaderLocale("Comments")).toBeNull();
    expect(xlsxHeaderLocale("Translation notes here")).toBeNull();
  });

  it("gives role columns priority over locale codes and prefers exact matches", () => {
    const columns = resolveXlsxHeaderColumns([
      "ID",
      "Chinese (Simplified)",
      "zh",
      "Max length",
      "notes",
    ]);
    expect(columns).toMatchObject({ key: 0, maxLength: 3, comment: 4 });
    expect(xlsxLocaleColumn(columns, "id")).toBe(-1);
    expect(xlsxLocaleColumn(columns, "zh-CN")).toBe(1);
    expect(xlsxLocaleColumn(columns, "zh-Hant")).toBe(2);
    expect(xlsxLocaleColumn(columns, "ja")).toBe(-1);
  });

  it("falls back from a regional locale to its base language and skips excluded columns", () => {
    const columns = resolveXlsxHeaderColumns(["English", "fr", "fr-CA"]);
    expect(xlsxLocaleColumn(columns, "fr-CA")).toBe(2);
    expect(xlsxLocaleColumn(columns, "fr-FR")).toBe(1);
    expect(xlsxLocaleColumn(columns, "en-GB")).toBe(0);
    expect(xlsxLocaleColumn(columns, "en-GB", [0])).toBe(-1);
  });
});
