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

  it("reports ICU plural option mismatches", () => {
    const issues = compare(
      "{count, plural, one {# file} other {# files}}",
      "{count, plural, one {# tệp} few {# tệp} other {# tệp}}",
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "icu-mismatch",
      }),
    );
  });

  it("reports parse failures", () => {
    const analysis = analyzeCatMessageFormat("{name");

    expect(analysis.parseError?.message).toBeTruthy();
  });
});
