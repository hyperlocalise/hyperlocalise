import { describe, expect, it } from "vite-plus/test";

import { applyOutcomeMessage } from "./workflow-ui";

describe("applyOutcomeMessage", () => {
  const label = (locale: string) => locale;

  it("reports success when segments were applied", () => {
    expect(applyOutcomeMessage("vi-VN", 1, 3, label).tone).toBe("positive");
  });

  it("treats pullable translations with zero canvas updates as already applied", () => {
    const outcome = applyOutcomeMessage("vi-VN", 1, 0, label, {
      total: 10,
      realTranslation: 8,
      missing: 0,
      sameAsSourceOneWord: 2,
      sameAsSourceMultiWord: 0,
      sameAsSourceKeys: [],
    });
    expect(outcome.tone).toBe("positive");
    expect(outcome.message).toContain("already on the selected");
  });

  it("warns when pull only contains source-language copies", () => {
    const outcome = applyOutcomeMessage("vi-VN", 1, 0, label, {
      total: 5,
      realTranslation: 0,
      missing: 0,
      sameAsSourceOneWord: 5,
      sameAsSourceMultiWord: 0,
      sameAsSourceKeys: [],
    });
    expect(outcome.tone).toBe("warn");
  });

  it("errors when nothing pullable was found", () => {
    const outcome = applyOutcomeMessage("vi-VN", 1, 0, label, {
      total: 0,
      realTranslation: 0,
      missing: 0,
      sameAsSourceOneWord: 0,
      sameAsSourceMultiWord: 0,
      sameAsSourceKeys: [],
    });
    expect(outcome.tone).toBe("critical");
  });
});
