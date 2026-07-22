/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { analyzeCatMessageFormat, compareCatMessageFormats } from "./cat-message-format";

function compare(sourceMessage: string, targetMessage: string) {
  return compareCatMessageFormats(
    analyzeCatMessageFormat(sourceMessage),
    analyzeCatMessageFormat(targetMessage),
  );
}

describe("cat message format utilities", () => {
  it("reports missing placeholders", () => {
    const issues = compare("Hello {name}", "Xin chào");

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "missing-token",
        tokens: ["{name}"],
      }),
    );
  });

  it("reports extra placeholders", () => {
    const issues = compare("Hello", "Xin chào {name}");

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "extra-token",
        tokens: ["{name}"],
      }),
    );
  });

  it("accepts locale-appropriate ICU plural categories", () => {
    const issues = compare(
      "{count, plural, one {# file} other {# files}}",
      "{count, plural, one {# tệp} few {# tệp} many {# tệp} other {# tệp}}",
    );

    expect(issues.filter((issue) => issue.kind === "icu-mismatch")).toHaveLength(0);
  });

  it("reports missing ICU blocks when argument name or type differs", () => {
    const issues = compare(
      "{count, plural, one {# file} other {# files}}",
      "{items, plural, one {# tệp} other {# tệp}}",
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "icu-mismatch",
        tokens: ["{count, plural}"],
      }),
    );
  });

  it("reports parse failures", () => {
    const analysis = analyzeCatMessageFormat("{name");

    expect(analysis.parseError?.message).toBeTruthy();
  });

  it("does not pass format checks when source ICU syntax cannot be parsed", () => {
    const issues = compare("{count, plural, one {# file}}", "1 file");

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "parse-error",
        parseTarget: "source",
      }),
    );
  });
});
