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

import { validateTranslationSegment } from "./validate-segment";

describe("validateTranslationSegment", () => {
  it("fails empty targets", () => {
    const checks = validateTranslationSegment({
      sourceText: "Hello",
      targetText: "",
      targetLocale: "fr-FR",
    });

    expect(checks).toEqual([
      expect.objectContaining({
        checkType: "not_localized",
        severity: "error",
        message: "Target value is empty.",
      }),
    ]);
  });

  it("warns when the target is only whitespace", () => {
    const checks = validateTranslationSegment({
      sourceText: "Hello",
      targetText: "   ",
      targetLocale: "fr-FR",
    });

    expect(checks.map((check) => check.checkType)).toEqual(["not_localized", "whitespace_only"]);
  });

  it("warns when the target matches the source", () => {
    const checks = validateTranslationSegment({
      sourceText: "Save",
      targetText: "Save",
      targetLocale: "fr-FR",
    });

    expect(checks.map((check) => check.checkType)).toEqual(["same_as_source"]);
  });

  it("warns when the target introduces escaped characters", () => {
    const checks = validateTranslationSegment({
      sourceText: "Included",
      targetText: "Inclus\\tgranted",
      targetLocale: "fr-FR",
    });

    expect(checks).toEqual([
      expect.objectContaining({
        checkType: "escaped_char_mismatch",
        relatedTokens: ["\\t"],
      }),
    ]);
  });

  it("covers CAT unicode, hex, and decoded control escapes", () => {
    expect(
      validateTranslationSegment({
        sourceText: "Save",
        targetText: "Enregistrer\\n\\u00A0",
        targetLocale: "fr-FR",
      }).flatMap((check) => check.relatedTokens),
    ).toEqual(["\\n", "\\u00A0"]);

    expect(
      validateTranslationSegment({
        sourceText: "Included",
        targetText: "Inclus\u0000granted",
        targetLocale: "fr-FR",
      }).flatMap((check) => check.relatedTokens),
    ).toEqual(["\\u0000"]);

    expect(
      validateTranslationSegment({
        sourceText: "Included",
        targetText: "Inclus\u0008\u001b\u000b\u000c\u007f\u0085",
        targetLocale: "fr-FR",
      }).flatMap((check) => check.relatedTokens),
    ).toEqual(["\\f", "\\u0008", "\\u001b", "\\u007f", "\\u0085", "\\v"]);

    expect(
      validateTranslationSegment({
        sourceText: "Icon \\U0001F600 and \\x1F",
        targetText: "Icône \\U0001F600 and \\x1F",
        targetLocale: "fr-FR",
      }),
    ).toEqual([]);
  });

  it("fails translations that exceed maxLength", () => {
    const checks = validateTranslationSegment({
      sourceText: "Hi",
      targetText: "Bonjour",
      targetLocale: "fr-FR",
      maxLength: 4,
    });

    expect(checks).toEqual([
      expect.objectContaining({
        checkType: "length",
        message: "Translation exceeds 4 characters.",
      }),
    ]);
  });

  it("fails missing placeholders", () => {
    const checks = validateTranslationSegment({
      sourceText: "Hello {name}",
      targetText: "Bonjour",
      targetLocale: "fr-FR",
    });

    expect(checks).toEqual([
      expect.objectContaining({
        checkType: "placeholder_mismatch",
        relatedTokens: ["{name}"],
      }),
    ]);
  });

  it("reports glossary misses and forbidden terms", () => {
    const checks = validateTranslationSegment({
      sourceText: "Open the admin Dashboard",
      targetText: "Ouvrir le panel admin",
      targetLocale: "fr-FR",
      glossaryTerms: [
        {
          sourceTerm: "Dashboard",
          targetTerm: "Tableau de bord",
          targetLocale: "fr-FR",
          forbidden: false,
          caseSensitive: false,
        },
        {
          sourceTerm: "admin",
          targetTerm: "admin",
          targetLocale: "fr-FR",
          forbidden: true,
          caseSensitive: false,
        },
      ],
    });

    expect(checks.map((check) => check.checkType)).toEqual([
      "glossary_violation",
      "glossary_violation",
    ]);
  });

  it("returns no checks for a clean translation", () => {
    expect(
      validateTranslationSegment({
        sourceText: "Hello {name}",
        targetText: "Bonjour {name}",
        targetLocale: "fr-FR",
      }),
    ).toEqual([]);
  });
});
