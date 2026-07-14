import { describe, expect, it } from "vite-plus/test";

import { inferTmMatchKind, requiresLowMatchConfirmation } from "./tm-match-quality";

describe("inferTmMatchKind", () => {
  it("classifies below-100 scores as fuzzy", () => {
    expect(inferTmMatchKind(85, "Hello", "Hello")).toBe("fuzzy");
  });

  it("classifies identical source at 100% as exact", () => {
    expect(inferTmMatchKind(100, "Hello world", "Hello world")).toBe("exact");
  });

  it("classifies different source at 100% as context", () => {
    expect(inferTmMatchKind(100, "Hello", "Hello world")).toBe("context");
  });
});

describe("requiresLowMatchConfirmation", () => {
  it("requires confirmation below 70%", () => {
    expect(requiresLowMatchConfirmation(69)).toBe(true);
    expect(requiresLowMatchConfirmation(70)).toBe(false);
  });
});
