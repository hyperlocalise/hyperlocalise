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

import { isSandboxFileTranslationFormat, sandboxEntriesLocaleOptions } from "./sandbox-cli-release";
import {
  hyperlocaliseCliOfficeReleaseVersion,
  isReleaseVersionAtLeast,
  sandboxCliParsesOffice,
} from "./sandbox-cli-version";

describe("isReleaseVersionAtLeast", () => {
  it("compares numeric release parts", () => {
    expect(isReleaseVersionAtLeast("1.13.3", "1.13.4")).toBe(false);
    expect(isReleaseVersionAtLeast("1.13.4", "1.13.4")).toBe(true);
    expect(isReleaseVersionAtLeast("v1.13.5", "1.13.4")).toBe(true);
    expect(isReleaseVersionAtLeast("1.9.0", "1.10.0")).toBe(false);
    expect(isReleaseVersionAtLeast("2.0", "1.13.4")).toBe(true);
  });

  it("ignores prerelease suffixes", () => {
    expect(isReleaseVersionAtLeast("1.13.4-rc.1", "1.13.4")).toBe(true);
  });
});

describe("sandboxCliParsesOffice", () => {
  it("turns on at the first CLI release that reads Office files", () => {
    expect(sandboxCliParsesOffice("1.13.3")).toBe(false);
    expect(sandboxCliParsesOffice()).toBe(true);
    expect(sandboxCliParsesOffice(hyperlocaliseCliOfficeReleaseVersion)).toBe(true);
  });
});

describe("isSandboxFileTranslationFormat", () => {
  it("adds Office files to file translation once the CLI parses them", () => {
    expect(isSandboxFileTranslationFormat("json", false)).toBe(true);
    for (const format of ["docx", "xlsx", "xls", "pptx"]) {
      expect(isSandboxFileTranslationFormat(format, false)).toBe(false);
      expect(isSandboxFileTranslationFormat(format, true)).toBe(true);
    }
  });

  it("rejects formats outside file translation", () => {
    expect(isSandboxFileTranslationFormat("rtf", true)).toBe(false);
  });
});

describe("sandboxEntriesLocaleOptions", () => {
  it("names the source column for workbooks", () => {
    expect(sandboxEntriesLocaleOptions("strings.xlsx", "en-US")).toEqual({
      sourceLocale: "en-US",
      locale: "en-US",
    });
    expect(sandboxEntriesLocaleOptions("Strings.XLS", "en-US", "fr-FR")).toEqual({
      sourceLocale: "en-US",
      locale: "fr-FR",
    });
  });

  it("keeps other formats and missing source locales unchanged", () => {
    expect(sandboxEntriesLocaleOptions("en.json", "en-US", "fr-FR")).toEqual({});
    expect(sandboxEntriesLocaleOptions("deck.pptx", "en-US", "fr-FR")).toEqual({});
    expect(sandboxEntriesLocaleOptions("strings.xlsx", null, "fr-FR")).toEqual({});
  });
});
