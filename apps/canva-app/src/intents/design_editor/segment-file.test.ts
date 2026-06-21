import { describe, expect, it } from "vite-plus/test";

import {
  buildSourcePath,
  parseTranslationFile,
  segmentKey,
  segmentsToTranslationFile,
} from "./segment-file";

describe("segment-file", () => {
  it("builds stable segment keys and source paths", () => {
    expect(segmentKey(1, 2, 3)).toBe("canva.segment.1.2.3");
    expect(buildSourcePath("design-123")).toBe("canva/designs/design-123.json");
  });

  it("serializes and parses translation files", () => {
    const file = segmentsToTranslationFile([
      {
        key: "canva.segment.0.0.0",
        pageIndex: 0,
        contentIndex: 0,
        regionIndex: 0,
        text: "Hello",
      },
      {
        key: "canva.segment.0.0.1",
        pageIndex: 0,
        contentIndex: 0,
        regionIndex: 1,
        text: "World",
      },
    ]);

    expect(file).toEqual({
      "canva.segment.0.0.0": "Hello",
      "canva.segment.0.0.1": "World",
    });

    expect(parseTranslationFile(file)).toEqual(file);
  });
});
