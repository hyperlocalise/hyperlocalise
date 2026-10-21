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

import { describe, expect, test } from "vite-plus/test";

import {
  buildTranslatedDriveName,
  isLocaleFolderName,
  isAnyTranslationOutputFile,
  isTranslationOutputFile,
  parseTranslationPrefix,
  parseTranslationSuffix,
  parseTranslationUnderscore,
  pathHasLocaleFolder,
} from "./translation-filename";

describe("translation-filename", () => {
  test("builds each translation output name", () => {
    expect(
      buildTranslatedDriveName({ output: "prefix", locale: "fr", fileName: "Report.docx" }),
    ).toBe("[fr] Report.docx");
    expect(
      buildTranslatedDriveName({ output: "suffix", locale: "fr", fileName: "Report.docx" }),
    ).toBe("Report [fr].docx");
    expect(
      buildTranslatedDriveName({ output: "underscore", locale: "fr", fileName: "Report.docx" }),
    ).toBe("Report_fr.docx");
    expect(
      buildTranslatedDriveName({ output: "folder", locale: "fr", fileName: "Report.docx" }),
    ).toBe("Report.docx");
  });

  test("parses prefix, suffix, and underscore names", () => {
    expect(parseTranslationPrefix("[fr] Report.docx")).toEqual({
      locale: "fr",
      baseName: "Report.docx",
    });
    expect(parseTranslationSuffix("Report [fr].docx")).toEqual({
      locale: "fr",
      baseName: "Report.docx",
    });
    expect(parseTranslationUnderscore("Report_fr.docx")).toEqual({
      locale: "fr",
      baseName: "Report.docx",
    });
    expect(parseTranslationPrefix("[draft] Report.docx")).toBeNull();
    expect(parseTranslationUnderscore("Report_notes.docx")).toBeNull();
  });

  test("isLocaleFolderName accepts BCP-47 folder names", () => {
    expect(isLocaleFolderName("fr-FR")).toBe(true);
    expect(isLocaleFolderName("not-a-locale")).toBe(false);
  });

  test("pathHasLocaleFolder detects locale path segments", () => {
    expect(pathHasLocaleFolder("Briefs/fr")).toBe(true);
    expect(pathHasLocaleFolder("Briefs/Drafts")).toBe(false);
  });

  test("isTranslationOutputFile honors the selected output", () => {
    expect(isTranslationOutputFile({ output: "prefix", name: "[fr] Report.docx" })).toBe(true);
    expect(isTranslationOutputFile({ output: "suffix", name: "Report [fr].docx" })).toBe(true);
    expect(isTranslationOutputFile({ output: "underscore", name: "Report_fr.docx" })).toBe(true);
    expect(
      isTranslationOutputFile({
        output: "folder",
        name: "Report.docx",
        relativePath: "fr",
      }),
    ).toBe(true);
    expect(isTranslationOutputFile({ output: "folder", name: "Report.docx" })).toBe(false);
    expect(isTranslationOutputFile({ output: "folder", name: "fr" })).toBe(true);
  });

  test("isAnyTranslationOutputFile matches every format", () => {
    expect(isAnyTranslationOutputFile({ name: "[fr] Report.docx" })).toBe(true);
    expect(isAnyTranslationOutputFile({ name: "Report [fr].docx" })).toBe(true);
    expect(isAnyTranslationOutputFile({ name: "Report_fr.docx" })).toBe(true);
    expect(isAnyTranslationOutputFile({ name: "fr" })).toBe(true);
    expect(isAnyTranslationOutputFile({ name: "Report.docx" })).toBe(false);
  });
});
