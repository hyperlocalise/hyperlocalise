import { describe, expect, it } from "vite-plus/test";

import {
  buildFigmaApplyTextIndex,
  normalizeSegmentText,
  resolveFigmaApplyTarget,
} from "./apply-translations";

describe("buildFigmaApplyTextIndex", () => {
  it("matches by normalized source text when stamps are missing on apply", () => {
    const key = "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const index = buildFigmaApplyTextIndex({
      sourceByKey: { [key]: "Hello" },
      translations: { [key]: "Xin chào" },
    });
    expect(normalizeSegmentText("Hello")).toBe("Hello");
    expect(index.get("Hello")).toEqual({ key, target: "Xin chào" });
    expect(
      resolveFigmaApplyTarget({
        nodeText: "Hello",
        stampedKey: null,
        translations: { [key]: "Xin chào" },
        textIndex: index,
      }),
    ).toBe("Xin chào");
  });
});
