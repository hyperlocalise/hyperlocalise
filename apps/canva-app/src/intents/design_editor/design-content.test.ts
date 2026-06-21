import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@canva/design", () => ({
  editContent: vi.fn(),
}));

import { applyTranslationsToRanges, extractSegmentsFromRanges } from "./design-content";

describe("design-content", () => {
  it("extracts plain text segments when formatting is disabled", () => {
    const segments = extractSegmentsFromRanges(
      [
        {
          readPlaintext: () => "Hello world",
          readTextRegions: () => [{ text: "Hello" }, { text: " world" }],
          replaceText: () => undefined,
        },
      ],
      false,
    );

    expect(segments).toEqual([
      {
        key: "canva.segment.0.0",
        contentIndex: 0,
        regionIndex: 0,
        text: "Hello world",
      },
    ]);
  });

  it("extracts formatted regions when formatting is enabled", () => {
    const segments = extractSegmentsFromRanges(
      [
        {
          readPlaintext: () => "Hello world",
          readTextRegions: () => [{ text: "Hello" }, { text: " world" }],
          replaceText: () => undefined,
        },
      ],
      true,
    );

    expect(segments).toEqual([
      {
        key: "canva.segment.0.0",
        contentIndex: 0,
        regionIndex: 0,
        text: "Hello",
      },
      {
        key: "canva.segment.0.1",
        contentIndex: 0,
        regionIndex: 1,
        text: " world",
      },
    ]);
  });

  it("applies translated text back to ranges", () => {
    const replacements: Array<{ index: number; length: number; text: string }> = [];

    applyTranslationsToRanges(
      [
        {
          readPlaintext: () => "Hello world",
          readTextRegions: () => [{ text: "Hello" }, { text: " world" }],
          replaceText: (range, text) => {
            replacements.push({ index: range.index, length: range.length, text });
          },
        },
      ],
      {
        "canva.segment.0.0": "Hola",
        "canva.segment.0.1": " mundo",
      },
      true,
    );

    expect(replacements).toEqual([
      { index: 5, length: 6, text: " mundo" },
      { index: 0, length: 5, text: "Hola" },
    ]);
  });
});
