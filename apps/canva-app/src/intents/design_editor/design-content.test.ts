/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@canva/design", () => ({
  openDesign: vi.fn(),
  editContent: vi.fn(),
}));

import { editContent, openDesign } from "@canva/design";

import {
  applyTranslationsToCurrentPage,
  applyTranslationsToDesign,
  applyTranslationsToRange,
  buildPageSummaries,
  extractSegmentsFromRange,
} from "./design-content";

describe("design-content", () => {
  beforeEach(() => {
    vi.mocked(openDesign).mockReset();
    vi.mocked(editContent).mockReset();
  });

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

  it("replaces the whole text box when Hyperlocalise only has one segment key", () => {
    const replacements: Array<{ index: number; length: number; text: string }> = [];

    expect(
      applyTranslationsToRange(
        {
          readPlaintext: () => "Buy 1 Get 1 Free",
          readTextRegions: () => [{ text: "Buy 1 Get 1 " }, { text: "Free" }],
          replaceText: (range, text) => {
            replacements.push({ index: range.index, length: range.length, text });
          },
        },
        {
          "canva.segment.0.0": "Mua 1 tặng 1",
        },
        0,
        true,
      ),
    ).toBe(1);

    expect(replacements).toEqual([{ index: 0, length: 16, text: "Mua 1 tặng 1" }]);
  });

  it("replaces the whole text box when the first segment was edited as a full phrase", () => {
    const replacements: Array<{ index: number; length: number; text: string }> = [];

    expect(
      applyTranslationsToRange(
        {
          readPlaintext: () => "Buy 1 Get 1 Free",
          readTextRegions: () => [{ text: "Buy 1 Get 1 " }, { text: "Free" }],
          replaceText: (range, text) => {
            replacements.push({ index: range.index, length: range.length, text });
          },
        },
        {
          "canva.segment.0.0": "Mua 1 tặng 1",
          "canva.segment.0.1": "miễn phí",
        },
        0,
        true,
      ),
    ).toBe(1);

    expect(replacements).toEqual([{ index: 0, length: 16, text: "Mua 1 tặng 1" }]);
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
        "canva.segment.1.0": "Hola",
        "canva.segment.1.1": " mundo",
      },
      1,
      true,
    );

    expect(replacements).toEqual([
      { index: 5, length: 6, text: " mundo" },
      { index: 0, length: 5, text: "Hola" },
    ]);
  });

  it("applies page-local keys when writing onto another page", () => {
    const replacements: Array<{ index: number; length: number; text: string }> = [];

    applyTranslationsToRange(
      {
        readPlaintext: () => "Hello",
        readTextRegions: () => [{ text: "Hello" }],
        replaceText: (range, text) => {
          replacements.push({ index: range.index, length: range.length, text });
        },
      },
      {
        "canva.segment.0.0": "Hallo",
      },
      0,
      false,
    );

    expect(replacements).toEqual([{ index: 0, length: 5, text: "Hallo" }]);
  });

  it("applies full-page keys from older collected files", () => {
    const replacements: Array<{ index: number; length: number; text: string }> = [];

    applyTranslationsToRange(
      {
        readPlaintext: () => "Hello",
        readTextRegions: () => [{ text: "Hello" }],
        replaceText: (range, text) => {
          replacements.push({ index: range.index, length: range.length, text });
        },
      },
      {
        "canva.segment.2.0.0": "Hallo",
      },
      0,
      false,
    );

    expect(replacements).toEqual([{ index: 0, length: 5, text: "Hallo" }]);
  });

  it("skips blank translations when applying", () => {
    const replacements: string[] = [];

    expect(
      applyTranslationsToRange(
        {
          readPlaintext: () => "Hello",
          readTextRegions: () => [{ text: "Hello" }],
          replaceText: (_range, text) => {
            replacements.push(text);
          },
        },
        {
          "canva.segment.0.0": "   ",
        },
        0,
        false,
      ),
    ).toBe(0);
    expect(replacements).toEqual([]);
  });

  it("skips translations that already match the design text", () => {
    const replacements: string[] = [];

    expect(
      applyTranslationsToRange(
        {
          readPlaintext: () => "Hello",
          readTextRegions: () => [{ text: "Hello" }],
          replaceText: (_range, text) => {
            replacements.push(text);
          },
        },
        {
          "canva.segment.0.0": "Hello",
        },
        0,
        false,
      ),
    ).toBe(0);
    expect(replacements).toEqual([]);
  });

  it("applies the selected file onto the current Canva page through editContent", async () => {
    const replacements: string[] = [];
    const sync = vi.fn(async () => undefined);

    vi.mocked(editContent).mockImplementation(async (options, callback) => {
      expect(options).toEqual({ contentType: "richtext", target: "current_page" });
      await callback({
        contents: [
          {
            deleted: false,
            readPlaintext: () => "Hello",
            readTextRegions: () => [{ text: "Hello" }],
            replaceText: (_range: { index: number; length: number }, text: string) => {
              replacements.push(text);
            },
          },
        ],
        sync,
      } as never);
    });

    await expect(
      applyTranslationsToCurrentPage({ "canva.segment.0.0": "Hola" }, false),
    ).resolves.toBe(1);
    expect(replacements).toEqual(["Hola"]);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(openDesign).not.toHaveBeenCalled();
  });

  it("does not fall back to openDesign when editContent finds no replacements", async () => {
    vi.mocked(editContent).mockImplementation(async (_options, callback) => {
      await callback({
        contents: [
          {
            deleted: false,
            readPlaintext: () => "Hello",
            readTextRegions: () => [{ text: "Hello" }],
            replaceText: () => {
              throw new Error("should not replace");
            },
          },
        ],
        sync: vi.fn(async () => undefined),
      } as never);
    });

    await expect(
      applyTranslationsToCurrentPage({ "canva.segment.0.0": "Hello" }, false),
    ).resolves.toBe(0);
    expect(openDesign).not.toHaveBeenCalled();
  });

  it("falls back to openDesign when editContent is unavailable", async () => {
    const replacements: string[] = [];
    const sync = vi.fn(async () => undefined);

    vi.mocked(editContent).mockRejectedValue(new Error("unsupported"));
    vi.mocked(openDesign).mockImplementation(async (options, callback) => {
      expect(options).toEqual({ type: "current_page" });
      await callback({
        page: {
          type: "absolute",
          locked: false,
          elements: {
            forEach: (visitor: (element: { type: string; text: unknown }) => void) => {
              visitor({
                type: "text",
                text: {
                  readPlaintext: () => "Hello",
                  readTextRegions: () => [{ text: "Hello" }],
                  replaceText: (_range: { index: number; length: number }, text: string) => {
                    replacements.push(text);
                  },
                },
              });
            },
          },
        },
        sync,
      } as never);
    });

    await expect(
      applyTranslationsToCurrentPage({ "canva.segment.0.0": "Hola" }, false),
    ).resolves.toBe(1);
    expect(replacements).toEqual(["Hola"]);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("applies every page in one all_pages session", async () => {
    const replacements: string[] = [];
    const sync = vi.fn(async () => undefined);

    vi.mocked(openDesign).mockImplementation(async (options, callback) => {
      expect(options).toEqual({ type: "all_pages" });
      await callback({
        pageRefs: {
          toArray: () => [
            { type: "absolute", locked: false },
            { type: "absolute", locked: false },
          ],
        },
        helpers: {
          openPage: async (
            _pageRef: unknown,
            pageCallback: (result: {
              page: {
                type: string;
                locked: boolean;
                elements: { forEach: (visitor: (element: unknown) => void) => void };
              };
            }) => Promise<void>,
          ) => {
            const pageIndex = replacements.length;
            await pageCallback({
              page: {
                type: "absolute",
                locked: false,
                elements: {
                  forEach: (visitor: (element: unknown) => void) => {
                    visitor({
                      type: "text",
                      text: {
                        readPlaintext: () => (pageIndex === 0 ? "Hello" : "World"),
                        readTextRegions: () => [{ text: pageIndex === 0 ? "Hello" : "World" }],
                        replaceText: (_range: unknown, text: string) => {
                          replacements.push(text);
                        },
                      },
                    });
                  },
                },
              },
            });
            return { status: "executed" };
          },
        },
        sync,
      } as never);
    });

    await expect(
      applyTranslationsToDesign(
        [
          { pageIndex: 0, translations: { "canva.segment.0.0": "Hola" } },
          { pageIndex: 1, translations: { "canva.segment.0.0": "Mundo" } },
        ],
        false,
      ),
    ).resolves.toBe(2);
    expect(replacements).toEqual(["Hola", "Mundo"]);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("does not fail when Canva omits executed status but text was replaced", async () => {
    const replacements: string[] = [];
    const sync = vi.fn(async () => undefined);

    vi.mocked(openDesign).mockImplementation(async (_options, callback) => {
      await callback({
        pageRefs: {
          toArray: () => [{ type: "absolute", locked: false }],
        },
        helpers: {
          openPage: async (
            _pageRef: unknown,
            pageCallback: (result: {
              page: {
                type: string;
                locked: boolean;
                elements: { forEach: (visitor: (element: unknown) => void) => void };
              };
            }) => Promise<void>,
          ) => {
            await pageCallback({
              page: {
                type: "absolute",
                locked: false,
                elements: {
                  forEach: (visitor: (element: unknown) => void) => {
                    visitor({
                      type: "text",
                      text: {
                        readPlaintext: () => "Hello",
                        readTextRegions: () => [{ text: "Hello" }],
                        replaceText: (_range: unknown, text: string) => {
                          replacements.push(text);
                        },
                      },
                    });
                  },
                },
              },
            });
            return { status: "skipped" };
          },
        },
        sync,
      } as never);
    });

    await expect(
      applyTranslationsToDesign(
        [{ pageIndex: 0, translations: { "canva.segment.0.0": "Hola" } }],
        false,
      ),
    ).resolves.toBe(1);
    expect(replacements).toEqual(["Hola"]);
  });
});
