import { describe, expect, it } from "vite-plus/test";

import {
  segmentKey,
  buildSourcePath,
  segmentsToTranslationFile,
  parseTranslationFile,
} from "./segment-file";

describe("canva segment-file", () => {
  it("builds stable segment keys and source paths", () => {
    expect(segmentKey(1, 2, 3)).toBe("canva.segment.1.2.3");
    expect(buildSourcePath("design-123")).toBe("canva/designs/design-123.json");
  });

  it("serializes and parses translation files", () => {
    const segments = [
      {
        key: "canva.segment.0.0.0",
        pageIndex: 0,
        contentIndex: 0,
        regionIndex: 0,
        text: "Hello",
      },
    ];

    expect(segmentsToTranslationFile(segments)).toEqual({
      "canva.segment.0.0.0": "Hello",
    });

    expect(
      parseTranslationFile({
        "canva.segment.0.0.0": "Hola",
        ignored: "value",
      }),
    ).toEqual({
      "canva.segment.0.0.0": "Hola",
    });
  });
});
