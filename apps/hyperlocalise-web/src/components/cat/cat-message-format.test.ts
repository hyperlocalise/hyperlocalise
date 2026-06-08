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
});
