import { describe, expect, it } from "vite-plus/test";

import type { FigmaSegment } from "./plugin-messages";
import { remapExtractedSegmentsToSource } from "./extract-source";

const pullPage = {
  locale: "en",
  sourcePath: "figma/files/a/page-1.json",
  needsReupload: false,
  entries: [
    {
      key: "figma.k.HELLO",
      source: "Hello",
      knownTexts: ["Hola"],
    },
  ],
};

describe("remapExtractedSegmentsToSource", () => {
  it("returns segments unchanged when re-upload is required", () => {
    const segments: FigmaSegment[] = [
      { key: "figma.k.HELLO", nodeId: "1:1", regionIndex: 0, text: "Hola" },
    ];
    expect(
      remapExtractedSegmentsToSource(segments, { ...pullPage, needsReupload: true, entries: [] }),
    ).toEqual(segments);
  });

  it("remaps by stamp key to server source text", () => {
    const segments: FigmaSegment[] = [
      { key: "figma.k.HELLO", nodeId: "1:1", regionIndex: 0, text: "Hola" },
    ];
    expect(remapExtractedSegmentsToSource(segments, pullPage)).toEqual([
      { key: "figma.k.HELLO", nodeId: "1:1", regionIndex: 0, text: "Hello" },
    ]);
  });

  it("remaps by normalized canvas text via knownTexts", () => {
    const segments: FigmaSegment[] = [
      { key: "figma.k.OTHER", nodeId: "1:1", regionIndex: 0, text: "Hola" },
    ];
    expect(remapExtractedSegmentsToSource(segments, pullPage)).toEqual([
      { key: "figma.k.OTHER", nodeId: "1:1", regionIndex: 0, text: "Hello" },
    ]);
  });
});
