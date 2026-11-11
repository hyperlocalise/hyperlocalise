import { describe, expect, it } from "vite-plus/test";

import {
  detectTextOverflow,
  exceedsCharacterLimit,
  figmaDesignUrl,
  frameExportScale,
  markerForNode,
  matchSummaryMessage,
  parseFigmaFileLink,
  parseKeyLink,
  planKeyLinks,
  previewSummaryMessage,
  serializeKeyLink,
  type DesignKeyMatch,
  type DesignTextNode,
} from "./design-context";

const key = {
  id: "6f1c1f9e-8a7b-4c39-9d1f-3a8f2b1c0d11",
  key: "checkout.title",
  sourcePath: "locales/en.json",
  sourceText: "Checkout",
  maxLength: 12,
};

function textNode(nodeId: string, linked = false): DesignTextNode {
  return {
    nodeId,
    text: "Checkout",
    layerName: "Title",
    frameId: "1:1",
    frameName: "Checkout",
    link: linked ? { id: "other", key: "other.key", sourcePath: null, maxLength: null } : null,
  };
}

describe("key links", () => {
  it("round-trips through plugin data and rejects junk", () => {
    const link = { id: key.id, key: key.key, sourcePath: key.sourcePath, maxLength: 12 };
    expect(parseKeyLink(serializeKeyLink(link))).toEqual(link);
    expect(parseKeyLink("")).toBeNull();
    expect(parseKeyLink("{nope")).toBeNull();
    expect(parseKeyLink(JSON.stringify({ key: "x" }))).toBeNull();
  });
});

describe("parseFigmaFileLink", () => {
  it("reads the file key from design, file and prototype links", () => {
    expect(parseFigmaFileLink("https://www.figma.com/design/AbCdEf123456/App?node-id=1-2")).toBe(
      "AbCdEf123456",
    );
    expect(parseFigmaFileLink(" https://figma.com/file/AbCdEf123456 ")).toBe("AbCdEf123456");
    expect(parseFigmaFileLink("https://www.figma.com/proto/AbCdEf123456/App")).toBe("AbCdEf123456");
  });

  it("rejects other hosts and non-file links", () => {
    expect(parseFigmaFileLink("https://evil.example/design/AbCdEf123456")).toBeNull();
    expect(parseFigmaFileLink("http://www.figma.com/design/AbCdEf123456")).toBeNull();
    expect(parseFigmaFileLink("https://www.figma.com/files/recents")).toBeNull();
    expect(parseFigmaFileLink("not a url")).toBeNull();
  });
});

describe("figmaDesignUrl", () => {
  it("links to the frame node", () => {
    expect(figmaDesignUrl("AbCdEf123456", "Checkout flow v2", "12:34")).toBe(
      "https://www.figma.com/design/AbCdEf123456/Checkout-flow-v2?node-id=12-34",
    );
  });
});

describe("markerForNode", () => {
  const frame = { x: 100, y: 200, width: 400, height: 800 };

  it("converts a node box to frame percentages", () => {
    expect(markerForNode(frame, { x: 140, y: 280, width: 200, height: 40 })).toEqual({
      left: 10,
      top: 10,
      width: 50,
      height: 5,
    });
  });

  it("clips a node that sticks out of the frame", () => {
    expect(markerForNode(frame, { x: 400, y: 950, width: 200, height: 100 })).toEqual({
      left: 75,
      top: 93.75,
      width: 25,
      height: 6.25,
    });
  });

  it("drops a node entirely outside the frame", () => {
    expect(markerForNode(frame, { x: 0, y: 0, width: 50, height: 50 })).toBeNull();
  });

  it("never lets rounding exceed the frame", () => {
    const marker = markerForNode(
      { x: 0, y: 0, width: 3, height: 3 },
      { x: 1, y: 1, width: 2, height: 2 },
    )!;
    expect(marker.left + marker.width).toBeLessThanOrEqual(100);
    expect(marker.top + marker.height).toBeLessThanOrEqual(100);
  });
});

describe("frameExportScale", () => {
  it("never upscales and caps the long side", () => {
    expect(frameExportScale({ width: 375, height: 812 })).toBe(1);
    expect(frameExportScale({ width: 8192, height: 1000 })).toBe(0.5);
  });
});

describe("detectTextOverflow", () => {
  const box = { x: 0, y: 0, width: 100, height: 20 };

  it("flags a fixed box whose text outgrows it", () => {
    expect(
      detectTextOverflow({
        textAutoResize: "NONE",
        box,
        render: { x: 0, y: 0, width: 100, height: 40 },
        clip: null,
      }),
    ).toBe(true);
  });

  it("allows auto-height text to grow when nothing clips it", () => {
    expect(
      detectTextOverflow({
        textAutoResize: "HEIGHT",
        box: { x: 0, y: 0, width: 100, height: 40 },
        render: { x: 0, y: 0, width: 100, height: 40 },
        clip: null,
      }),
    ).toBe(false);
  });

  it("flags text that spills out of a clipping frame", () => {
    expect(
      detectTextOverflow({
        textAutoResize: "WIDTH_AND_HEIGHT",
        box: { x: 10, y: 10, width: 200, height: 20 },
        render: { x: 10, y: 10, width: 200, height: 20 },
        clip: { x: 0, y: 0, width: 150, height: 100 },
      }),
    ).toBe(true);
  });

  it("ignores sub-pixel differences", () => {
    expect(
      detectTextOverflow({
        textAutoResize: "NONE",
        box,
        render: { x: 0, y: 0, width: 100.5, height: 20.5 },
        clip: { x: 0, y: 0, width: 100, height: 20 },
      }),
    ).toBe(false);
  });
});

describe("exceedsCharacterLimit", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(exceedsCharacterLimit("😀😀", 2)).toBe(false);
    expect(exceedsCharacterLimit("Passer la commande", 12)).toBe(true);
    expect(exceedsCharacterLimit("Anything", null)).toBe(false);
  });
});

describe("planKeyLinks", () => {
  it("links unique matches and keeps existing links", () => {
    const matches: DesignKeyMatch[] = [
      { nodeId: "a", matchedBy: "source_text", key, candidates: [key] },
      { nodeId: "b", matchedBy: "source_text", key: null, candidates: [key, { ...key, id: "k2" }] },
      { nodeId: "c", matchedBy: null, key: null, candidates: [] },
    ];
    const plan = planKeyLinks(
      [textNode("a"), textNode("b"), textNode("c"), textNode("d", true)],
      matches,
    );
    expect(plan.links).toEqual([
      {
        nodeId: "a",
        link: { id: key.id, key: key.key, sourcePath: key.sourcePath, maxLength: 12 },
      },
    ]);
    expect(plan.summary).toEqual({ linked: 1, alreadyLinked: 1, ambiguous: 1, unmatched: 1 });
    expect(matchSummaryMessage(plan.summary)).toBe(
      "Linked 1 new layer, 1 already linked, 1 with several matching keys, 1 with no matching key.",
    );
  });
});

describe("previewSummaryMessage", () => {
  it("warns when layers overflow or break the character limit", () => {
    const result = previewSummaryMessage({
      localeLabel: "French",
      applied: 4,
      missing: 1,
      issues: [
        {
          nodeId: "a",
          keyId: key.id,
          key: key.key,
          overflow: true,
          overLimit: true,
          length: 18,
          maxLength: 12,
        },
      ],
    });
    expect(result.tone).toBe("warn");
    expect(result.message).toBe(
      "Previewing French on 4 linked layers, 1 not translated yet, 1 overflow its box, 1 over the character limit.",
    );
  });

  it("is positive when everything fits", () => {
    expect(
      previewSummaryMessage({ localeLabel: "German", applied: 2, missing: 0, issues: [] }).tone,
    ).toBe("positive");
  });
});
