import { describe, expect, it } from "vite-plus/test";

import {
  inferTmMatchKind,
  requiresLowMatchConfirmation,
  selectBestTmMatchForAutoFill,
} from "./tm-match-quality";
import type { CatTranslationMemoryMatch } from "@/components/cat/shared/types";

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

describe("selectBestTmMatchForAutoFill", () => {
  const matches: CatTranslationMemoryMatch[] = [
    {
      id: "tm-1",
      sourceText: "A",
      targetText: "Alpha",
      matchPercent: 95,
    },
    {
      id: "tm-2",
      sourceText: "B",
      targetText: "Beta",
      matchPercent: 100,
      matchKind: "exact",
    },
  ];

  it("returns the highest match when it meets the threshold", () => {
    expect(selectBestTmMatchForAutoFill(matches, 100)?.id).toBe("tm-2");
  });

  it("returns undefined when the best match is below the threshold", () => {
    expect(selectBestTmMatchForAutoFill(matches, 100)).toBeDefined();
    expect(selectBestTmMatchForAutoFill([matches[0]], 100)).toBeUndefined();
  });
});
