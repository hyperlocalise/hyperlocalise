import { describe, expect, it } from "vite-plus/test";

import { createFigmaSegment, figmaSegmentKey } from "./segment-file";

describe("figma plugin segment keys", () => {
  it("builds stable keys for a node region", () => {
    expect(figmaSegmentKey("12:34", 2)).toBe("figma.segment.12:34.2");
    expect(createFigmaSegment({ nodeId: "12:34", regionIndex: 2, text: "Hello" })).toEqual({
      key: "figma.segment.12:34.2",
      nodeId: "12:34",
      regionIndex: 2,
      text: "Hello",
    });
  });
});
