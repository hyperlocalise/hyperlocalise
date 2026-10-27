import { describe, expect, it, vi } from "vite-plus/test";

import {
  createFigmaSegment,
  FIGMA_SEGMENT_KEY_PREFIX,
  mintFigmaSegmentKey,
  readStampedSegmentKey,
} from "./segment-file";

describe("figma plugin segment keys", () => {
  it("mints stamped keys", () => {
    expect(mintFigmaSegmentKey().startsWith(FIGMA_SEGMENT_KEY_PREFIX)).toBe(true);
  });

  it("reuses an existing stamp on the text node", () => {
    const setPluginData = vi.fn();
    const node = {
      getPluginData: vi
        .fn()
        .mockReturnValue(JSON.stringify({ key: "figma.k.EXISTINGSTAMP0000001" })),
      setPluginData,
      id: "12:34",
    } as unknown as TextNode;

    const segment = createFigmaSegment({
      node,
      regionIndex: 0,
      text: "Hello",
    });

    expect(segment.key).toBe("figma.k.EXISTINGSTAMP0000001");
    expect(setPluginData).not.toHaveBeenCalled();
    expect(readStampedSegmentKey(node)).toBe("figma.k.EXISTINGSTAMP0000001");
  });

  it("writes a new stamp when the node has none", () => {
    const setPluginData = vi.fn();
    const node = {
      getPluginData: vi.fn().mockReturnValue(""),
      setPluginData,
      id: "12:34",
    } as unknown as TextNode;

    const segment = createFigmaSegment({
      node,
      regionIndex: 0,
      text: "Hello",
    });

    expect(segment.key.startsWith(FIGMA_SEGMENT_KEY_PREFIX)).toBe(true);
    expect(setPluginData).toHaveBeenCalled();
  });
});
