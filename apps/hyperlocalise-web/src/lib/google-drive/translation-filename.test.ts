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
  buildTranslatedName,
  isLocaleFolderName,
  parseTranslationPrefix,
} from "./translation-filename";

describe("translation-filename", () => {
  test("parseTranslationPrefix detects locale-prefixed names", () => {
    expect(parseTranslationPrefix("[fr-FR] Report.docx")).toEqual({
      locale: "fr-FR",
      baseName: "Report.docx",
    });
  });

  test("parseTranslationPrefix ignores non-locale brackets", () => {
    expect(parseTranslationPrefix("[draft] Report.docx")).toBeNull();
  });

  test("isLocaleFolderName accepts BCP-47 folder names", () => {
    expect(isLocaleFolderName("fr-FR")).toBe(true);
    expect(isLocaleFolderName("not-a-locale")).toBe(false);
  });

  test("buildTranslatedName wraps base name", () => {
    expect(buildTranslatedName("fr-FR", "Report.docx")).toBe("[fr-FR] Report.docx");
  });
});
