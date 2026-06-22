import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@canva/design", () => ({
  openDesign: vi.fn(),
  editContent: vi.fn(),
}));

import {
  applyTranslationsToRange,
  buildPageSummaries,
  extractSegmentsFromRange,
} from "./design-content";

describe("design-content", () => {
  it("builds page summaries from page references", () => {
    expect(
      buildPageSummaries([
        { type: "absolute", locked: false },
        { type: "absolute", locked: true },
        { type: "unsupported", locked: false },
      ]),
    ).toEqual([
      { index: 0, label: "Page 1", locked: false, editable: true },
      { index: 1, label: "Page 2", locked: true, editable: false },
      { index: 2, label: "Page 3", locked: false, editable: false },
    ]);
  });

  it("extracts plain text segments when formatting is disabled", () => {
    const segments = extractSegmentsFromRange(
      {
        readPlaintext: () => "Hello world",
        readTextRegions: () => [{ text: "Hello" }, { text: " world" }],
        replaceText: () => undefined,
      },
      2,
      0,
      false,
    );

    expect(segments).toEqual([
      {
        key: "canva.segment.2.0.0",
        pageIndex: 2,
        contentIndex: 0,
        regionIndex: 0,
        text: "Hello world",
      },
    ]);
  });

  it("extracts formatted regions when formatting is enabled", () => {
    const segments = extractSegmentsFromRange(
      {
        readPlaintext: () => "Hello world",
        readTextRegions: () => [{ text: "Hello" }, { text: " world" }],
        replaceText: () => undefined,
      },
      1,
      3,
      true,
    );

    expect(segments).toEqual([
      {
        key: "canva.segment.1.3.0",
        pageIndex: 1,
        contentIndex: 3,
        regionIndex: 0,
        text: "Hello",
      },
      {
        key: "canva.segment.1.3.1",
        pageIndex: 1,
        contentIndex: 3,
        regionIndex: 1,
        text: " world",
      },
    ]);
  });

  it("applies translated text back to ranges", () => {
    const replacements: Array<{ index: number; length: number; text: string }> = [];

    applyTranslationsToRange(
      {
        readPlaintext: () => "Hello world",
        readTextRegions: () => [{ text: "Hello" }, { text: " world" }],
        replaceText: (range, text) => {
          replacements.push({ index: range.index, length: range.length, text });
        },
      },
      {
        "canva.segment.0.1.0": "Hola",
        "canva.segment.0.1.1": " mundo",
      },
      0,
      1,
      true,
    );

    expect(replacements).toEqual([
      { index: 5, length: 6, text: " mundo" },
      { index: 0, length: 5, text: "Hola" },
    ]);
  });
});
