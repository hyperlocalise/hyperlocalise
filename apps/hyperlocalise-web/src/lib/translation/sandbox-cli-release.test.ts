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
  hyperlocaliseCliXlsxReleaseVersion,
  isReleaseVersionAtLeast,
  sandboxCliParsesXlsx,
  sandboxEntriesLocaleOptions,
} from "./sandbox-cli-release";

describe("isReleaseVersionAtLeast", () => {
  it("compares numeric release parts", () => {
    expect(isReleaseVersionAtLeast("1.13.3", "1.14.0")).toBe(false);
    expect(isReleaseVersionAtLeast("1.14.0", "1.14.0")).toBe(true);
    expect(isReleaseVersionAtLeast("v1.14.1", "1.14.0")).toBe(true);
    expect(isReleaseVersionAtLeast("1.9.0", "1.10.0")).toBe(false);
    expect(isReleaseVersionAtLeast("2.0", "1.14.0")).toBe(true);
  });

  it("ignores prerelease suffixes", () => {
    expect(isReleaseVersionAtLeast("1.14.0-rc.1", "1.14.0")).toBe(true);
  });
});

describe("sandboxCliParsesXlsx", () => {
  it("turns on at the first CLI release that reads workbooks", () => {
    expect(sandboxCliParsesXlsx("1.13.3")).toBe(false);
    expect(sandboxCliParsesXlsx(hyperlocaliseCliXlsxReleaseVersion)).toBe(true);
  });
});

describe("sandboxEntriesLocaleOptions", () => {
  it("names the source column for workbooks", () => {
    expect(sandboxEntriesLocaleOptions("strings.xlsx", "en-US")).toEqual({
      sourceLocale: "en-US",
      locale: "en-US",
    });
    expect(sandboxEntriesLocaleOptions("Strings.XLSX", "en-US", "fr-FR")).toEqual({
      sourceLocale: "en-US",
      locale: "fr-FR",
    });
  });

  it("keeps other formats and missing source locales unchanged", () => {
    expect(sandboxEntriesLocaleOptions("en.json", "en-US", "fr-FR")).toEqual({});
    expect(sandboxEntriesLocaleOptions("rates.xls", "en-US", "fr-FR")).toEqual({});
    expect(sandboxEntriesLocaleOptions("strings.xlsx", null, "fr-FR")).toEqual({});
  });
});
