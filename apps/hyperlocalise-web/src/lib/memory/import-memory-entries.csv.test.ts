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

import { isOk } from "@/lib/primitives/result/results";

import { parseMemoryImportContent } from "./import-memory-entries";

describe("parseMemoryImportContent CSV formats", () => {
  it("parses Crowdin's locale-header CSV export", () => {
    const parsed = parseMemoryImportContent({
      format: "csv",
      content: ["en,vi", 'Discount,"Khuyến mãi hl"', '"Cancellation Reason","Lý do huỷ"'].join(
        "\n",
      ),
    });

    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;

    expect(parsed.value).toMatchObject({
      format: "csv",
      totalRead: 2,
      issues: [],
    });
    expect(parsed.value.candidates).toMatchObject([
      {
        sourceLocale: "en",
        targetLocale: "vi",
        sourceText: "Discount",
        targetText: "Khuyến mãi hl",
        matchScore: 100,
      },
      {
        sourceLocale: "en",
        targetLocale: "vi",
        sourceText: "Cancellation Reason",
        targetText: "Lý do huỷ",
        matchScore: 100,
      },
    ]);
  });

  it("expands Crowdin exports with multiple target locales", () => {
    const parsed = parseMemoryImportContent({
      format: "csv",
      content: ["en,fr,de", "Hello,Bonjour,Hallo"].join("\n"),
    });

    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;

    expect(parsed.value.candidates).toMatchObject([
      { sourceLocale: "en", targetLocale: "fr", targetText: "Bonjour" },
      { sourceLocale: "en", targetLocale: "de", targetText: "Hallo" },
    ]);
  });

  it("keeps translated locales when a Crowdin target cell is blank", () => {
    const parsed = parseMemoryImportContent({
      format: "csv",
      content: ["en,fr,de", "Hello,Bonjour,"].join("\n"),
    });

    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;

    expect(parsed.value.candidates).toMatchObject([
      { sourceLocale: "en", targetLocale: "fr", targetText: "Bonjour" },
    ]);
  });

  it("accepts underscore-separated Crowdin locale headers", () => {
    const parsed = parseMemoryImportContent({
      format: "csv",
      content: ["en_US,fr_FR", "Hello,Bonjour"].join("\n"),
    });

    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;

    expect(parsed.value.candidates).toMatchObject([
      {
        sourceLocale: "en_US",
        targetLocale: "fr_FR",
        sourceText: "Hello",
        targetText: "Bonjour",
      },
    ]);
  });

  it("does not misclassify a headerless generic row with locale-like text", () => {
    const parsed = parseMemoryImportContent({
      format: "csv",
      content: ["en,fr,OK,OK", "en,fr,Hello,Bonjour"].join("\n"),
    });

    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;

    expect(parsed.value.candidates).toMatchObject([
      { sourceLocale: "en", targetLocale: "fr", sourceText: "OK", targetText: "OK" },
      { sourceLocale: "en", targetLocale: "fr", sourceText: "Hello", targetText: "Bonjour" },
    ]);
  });

  it("keeps generic rows after a malformed two-cell preamble", () => {
    const parsed = parseMemoryImportContent({
      format: "csv",
      content: ["en,fr", "en,fr,Hello,Bonjour,92"].join("\n"),
    });

    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;

    expect(parsed.value.candidates).toMatchObject([
      {
        sourceLocale: "en",
        targetLocale: "fr",
        sourceText: "Hello",
        targetText: "Bonjour",
        matchScore: 92,
      },
    ]);
    expect(parsed.value.issues).toHaveLength(1);
  });

  it("reports malformed rows in Crowdin's locale-header format", () => {
    const parsed = parseMemoryImportContent({
      format: "csv",
      content: ["en,vi", ",Target", ",Another"].join("\n"),
    });

    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;

    expect(parsed.value.totalRead).toBe(2);
    expect(parsed.value.candidates).toHaveLength(0);
    expect(parsed.value.issues).toHaveLength(2);
  });

  it("keeps the existing generic CSV format", () => {
    const parsed = parseMemoryImportContent({
      format: "csv",
      content: "sourceLocale,targetLocale,sourceText,targetText,score\nen,fr,Hello,Bonjour,92",
    });

    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;

    expect(parsed.value.candidates[0]).toMatchObject({
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Hello",
      targetText: "Bonjour",
      matchScore: 92,
    });
  });
});
