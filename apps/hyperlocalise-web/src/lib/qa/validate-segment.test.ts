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

  describe("messageFormat", () => {
    const placeholderChecks = (
      sourceText: string,
      targetText: string,
      messageFormat?: "auto" | "icu" | "i18next",
    ) =>
      validateTranslationSegment({ sourceText, targetText, targetLocale: "fr-FR", messageFormat })
        .filter((check) => check.checkType === "placeholder_mismatch")
        .flatMap((check) => check.relatedTokens);

    it("checks single braces outside i18next mode", () => {
      expect(placeholderChecks("Hi {name}", "Salut")).toEqual(["{name}"]);
      expect(placeholderChecks("Hi {name}", "Salut", "icu")).toEqual(["{name}"]);
    });

    it("treats single braces as text in i18next mode", () => {
      expect(placeholderChecks("Hi {name}", "Salut", "i18next")).toEqual([]);
      expect(placeholderChecks("Hi {{name}}", "Salut", "i18next")).toEqual(["{{name}}"]);
    });

    it("treats i18next nesting as text in icu mode", () => {
      expect(placeholderChecks("See $t(common.more)", "Voir")).toEqual(["$t(common.more)"]);
      expect(placeholderChecks("See $t(common.more)", "Voir", "icu")).toEqual([]);
    });
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

  it("counts maxLength in Unicode code points so emoji is one character", () => {
    expect(
      validateTranslationSegment({
        sourceText: "Hi",
        targetText: "Hi😀",
        targetLocale: "fr-FR",
        maxLength: 3,
      }),
    ).toEqual([]);
  });

  it("fails when the target drops a repeated placeholder", () => {
    const checks = validateTranslationSegment({
      sourceText: "%s %s",
      targetText: "%s",
      targetLocale: "fr-FR",
    });

    expect(checks).toEqual([
      expect.objectContaining({
        checkType: "placeholder_mismatch",
        relatedTokens: ["%s"],
      }),
    ]);
  });

  it("fails when the target drops a Word formatting token", () => {
    const open = "\x1eHLOXPH_6F30_0\x1f";
    const close = "\x1eHLOXPH_6330_1\x1f";
    const checks = validateTranslationSegment({
      sourceText: `Read the ${open}terms${close} first.`,
      targetText: `Lisez d'abord les ${open}conditions.`,
      targetLocale: "fr-FR",
    });

    expect(checks).toEqual([
      expect.objectContaining({
        checkType: "placeholder_mismatch",
        relatedTokens: ["OX#1"],
      }),
    ]);
    expect(
      validateTranslationSegment({
        sourceText: `Read the ${open}terms${close} first.`,
        targetText: `Lisez d'abord les ${open}conditions${close}.`,
        targetLocale: "fr-FR",
      }).filter((check) => check.checkType === "placeholder_mismatch"),
    ).toEqual([]);
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

  it("fails missing i18next interpolations", () => {
    const checks = validateTranslationSegment({
      sourceText: "Hello {{name, uppercase}}",
      targetText: "Bonjour",
      targetLocale: "fr-FR",
    });

    expect(checks).toEqual([
      expect.objectContaining({
        checkType: "placeholder_mismatch",
        relatedTokens: ["{{name, uppercase}}"],
      }),
    ]);
  });

  it("accepts matching i18next interpolations and nesting", () => {
    expect(
      validateTranslationSegment({
        sourceText: "See {{name}} $t(help.link)",
        targetText: "Voir {{name}} $t(help.link)",
        targetLocale: "fr-FR",
      }).filter((check) => check.checkType === "placeholder_mismatch"),
    ).toEqual([]);
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
