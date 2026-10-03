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
  actionableFormatChecks,
  applyQaSuggestion,
  presentQaIssue,
  qaHighlightTokens,
  worstActionableFormatCheckStatus,
} from "./content-editor-side-by-side-qa";

describe("content-editor-side-by-side-qa", () => {
  it("keeps only actionable checks and prefers fail over warn", () => {
    const checks = [
      {
        id: "pass",
        label: "Placeholders",
        status: "pass" as const,
        message: "OK",
      },
      {
        id: "warn",
        label: "Spelling",
        status: "warn" as const,
        message: "Maybe",
      },
      {
        id: "fail",
        label: "Length",
        status: "fail" as const,
        message: "Too long",
      },
    ];

    expect(actionableFormatChecks(checks).map((check) => check.id)).toEqual(["warn", "fail"]);
    expect(worstActionableFormatCheckStatus(checks)).toBe("fail");
    expect(worstActionableFormatCheckStatus(checks.slice(0, 2))).toBe("warn");
    expect(worstActionableFormatCheckStatus([checks[0]])).toBeNull();
  });

  it("extracts a compact spelling issue and its first suggestion", () => {
    expect(
      presentQaIssue({
        id: "spelling",
        label: "Spelling",
        status: "warn",
        message: '"Drive" may be misspelled. Suggestions: Diverse, Driver.',
        relatedTokens: ["Drive", "Diverse", "Driver"],
      }),
    ).toEqual({
      label: "Spelling",
      message: '"Drive" may be misspelled',
      problemToken: "Drive",
      suggestion: "Diverse",
      status: "warn",
    });
  });

  it("parses a suggestion from the message when related tokens are missing", () => {
    expect(
      presentQaIssue({
        id: "spelling",
        label: "Spelling",
        status: "warn",
        message: '"Drive" may be misspelled. Suggestions: Diverse.',
      }).suggestion,
    ).toBe("Diverse");
  });

  it("keeps a glossary missing-term pair as a replacement suggestion", () => {
    expect(
      presentQaIssue({
        id: "glossary-missing-term-1",
        label: "Glossary",
        status: "warn",
        message: 'Glossary term "Cancel" requires "Stornierung".',
        category: "glossary",
        relatedTokens: ["Cancel", "Stornierung"],
      }).suggestion,
    ).toBe("Stornierung");
  });

  it("does not treat token lists as replacements", () => {
    expect(
      presentQaIssue({
        id: "qa-escaped-char-mismatch",
        label: "Escaped characters",
        status: "warn",
        message: "Target introduces escaped characters (\\t, \\n) that are not in the source.",
        category: "qa",
        relatedTokens: ["\\t", "\\n"],
      }).suggestion,
    ).toBeUndefined();
    expect(
      presentQaIssue({
        id: "scan-placeholder-mismatch",
        label: "Placeholders",
        status: "fail",
        message: "Target is missing placeholders ({name}).",
        category: "placeholder",
        relatedTokens: ["{name}", "{count}"],
      }).suggestion,
    ).toBeUndefined();
    expect(
      presentQaIssue({
        id: "scan-placeholder-mismatch",
        label: "Placeholders",
        status: "fail",
        message: "Target is missing placeholders ({name}). Suggestions: {count}.",
        category: "placeholder",
        relatedTokens: ["{name}"],
      }).suggestion,
    ).toBeUndefined();
  });

  it("replaces the first problem token when applying a suggestion", () => {
    expect(applyQaSuggestion("Drive the product", "Drive", "Diverse")).toBe("Diverse the product");
    expect(applyQaSuggestion("No match", "Drive", "Diverse")).toBe("No match");
  });

  it("highlights the problem token only when it appears in the translation", () => {
    const check = {
      id: "spelling",
      label: "Spelling",
      status: "warn" as const,
      message: '"Drive" may be misspelled.',
      relatedTokens: ["Drive", "Diverse"],
    };

    expect(qaHighlightTokens(check, "Drive the product")).toEqual(["Drive"]);
    expect(qaHighlightTokens(check, "Diverse the product")).toEqual([]);
    expect(qaHighlightTokens(undefined, "Drive the product")).toEqual([]);
  });
});
