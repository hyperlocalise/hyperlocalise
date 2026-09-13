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
  formatChecksFromScanFindings,
  mapQaFindingToFormatCheck,
} from "./map-finding-to-format-check";

describe("mapQaFindingToFormatCheck", () => {
  it("maps scan findings onto CAT format-check ids", () => {
    expect(
      mapQaFindingToFormatCheck({
        checkType: "not_localized",
        severity: "error",
        category: "qa",
        message: "Target value is empty.",
        relatedTokens: [],
        sourceText: "Hello",
        targetText: "",
        key: "hello",
        targetLocale: "fr-FR",
      }),
    ).toEqual({
      id: "qa-not-localized",
      label: "Translation",
      status: "fail",
      message: "Target value is empty.",
      category: "qa",
      relatedTokens: [],
    });
  });

  it("returns null for unknown check types", () => {
    expect(
      mapQaFindingToFormatCheck({
        checkType: "unknown",
        severity: "warning",
        category: "qa",
        message: "?",
        relatedTokens: [],
        sourceText: "Hello",
        targetText: "",
        key: "hello",
        targetLocale: "fr-FR",
      }),
    ).toBeNull();
  });

  it("reuses scan findings only when source and target text still match", () => {
    const finding = {
      checkType: "same_as_source",
      severity: "warning" as const,
      category: "qa",
      message: "Target value matches source.",
      relatedTokens: [],
      sourceText: "Save",
      targetText: "Save",
      translationKeyId: "key-1",
      key: "cta.save",
      targetLocale: "fr-FR",
    };

    expect(
      formatChecksFromScanFindings(
        [finding],
        { id: "key-1", key: "cta.save", targetLocale: "fr-FR", sourceText: "Save" },
        "Save",
      ),
    ).toHaveLength(1);
    expect(
      formatChecksFromScanFindings(
        [finding],
        { id: "key-1", key: "cta.save", targetLocale: "fr-FR", sourceText: "Save" },
        "Enregistrer",
      ),
    ).toEqual([]);
    expect(
      formatChecksFromScanFindings(
        [finding],
        { id: "key-1", key: "cta.save", targetLocale: "fr-FR", sourceText: "Save changes" },
        "Save",
      ),
    ).toEqual([]);
  });
});
