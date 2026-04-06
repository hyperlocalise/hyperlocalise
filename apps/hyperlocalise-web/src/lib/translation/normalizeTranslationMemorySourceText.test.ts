import { describe, expect, it } from "vitest";

import { normalizeTranslationMemorySourceText } from "./normalizeTranslationMemorySourceText";

describe("normalizeTranslationMemorySourceText", () => {
  it("trims, case-folds, and collapses repeated whitespace", () => {
    expect(normalizeTranslationMemorySourceText("  Hello   WORLD \n\t again  ")).toBe(
      "hello world again",
    );
  });

  it("normalizes Unicode compatibility forms before deduping", () => {
    expect(normalizeTranslationMemorySourceText("Ｆｕｌｌｗｉｄｔｈ Café")).toBe("fullwidth café");
  });

  it("is idempotent", () => {
    const normalized = normalizeTranslationMemorySourceText("  Hello   WORLD  ");

    expect(normalizeTranslationMemorySourceText(normalized)).toBe(normalized);
  });
});
