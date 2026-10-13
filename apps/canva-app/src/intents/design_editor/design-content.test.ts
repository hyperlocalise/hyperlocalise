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

import { openDesign } from "@canva/design";

import {
  applyTranslationsToDesign,
  buildApplyTextIndex,
  buildPageSummaries,
  extractDesignContent,
} from "./design-content";
import type { CanvaPullEntry, CanvaPullPage } from "./types";

function textBox(text: string, replaceText: (next: string) => void = () => undefined) {
  return {
    type: "text",
    text: {
      readPlaintext: () => text,
      readTextRegions: () => [{ text }],
      replaceText: (_range: unknown, next: string) => {
        replaceText(next);
      },
    },
  };
}

function pullPage(overrides: Partial<CanvaPullPage> = {}): CanvaPullPage {
  return {
    pageIndex: 0,
    needsReupload: false,
    entries: [
      {
        key: "canva.t.hello",
        source: "Hello",
        target: "Hola",
        knownTexts: ["Hello", "Hola"],
      },
    ],
    ...overrides,
  };
}

function mockDesignPages(
  pageTexts: string[][],
  onReplace?: (pageIndex: number, text: string) => void,
) {
  const replacements: string[] = [];
  const sync = vi.fn(async () => undefined);

  vi.mocked(openDesign).mockImplementation(async (options, callback) => {
    expect(options).toEqual({ type: "all_pages" });
    const pageRefs = pageTexts.map(() => ({ type: "absolute", locked: false }));
    await callback({
      pageRefs: {
        toArray: () => pageRefs,
      },
      helpers: {
        openPage: async (
          pageRef: { type: string; locked: boolean },
          pageCallback: (result: {
            page: {
              type: string;
              locked: boolean;
              elements: { forEach: (visitor: (element: unknown) => void) => void };
            };
          }) => Promise<void>,
        ) => {
          const pageIndex = pageRefs.indexOf(pageRef);
          const texts = pageTexts[pageIndex] ?? [];
          await pageCallback({
            page: {
              type: "absolute",
              locked: false,
              elements: {
                forEach: (visitor: (element: unknown) => void) => {
                  for (const text of texts) {
                    visitor(
                      textBox(text, (next) => {
                        replacements.push(next);
                        onReplace?.(pageIndex, next);
                      }),
                    );
                  }
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

  return { replacements, sync };
}

describe("design-content", () => {
  beforeEach(() => {
    vi.mocked(openDesign).mockReset();
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

  it("extracts one segment per text box and skips empty or locked pages", async () => {
    vi.mocked(openDesign).mockImplementation(async (_options, callback) => {
      await callback({
        pageRefs: {
          toArray: () => [
            { type: "absolute", locked: false },
            { type: "absolute", locked: true },
          ],
        },
        helpers: {
          openPage: async (
            _pageRef: unknown,
            pageCallback: (result: {
              page: { elements: { forEach: (visitor: (element: unknown) => void) => void } };
            }) => Promise<void>,
          ) => {
            await pageCallback({
              page: {
                elements: {
                  forEach: (visitor: (element: unknown) => void) => {
                    visitor(textBox("Hello"));
                    visitor(textBox("   "));
                    visitor({
                      type: "text",
                      locked: true,
                      text: {
                        readPlaintext: () => "Locked",
                        readTextRegions: () => [{ text: "Locked" }],
                        replaceText: () => undefined,
                      },
                    });
                    visitor(textBox("World"));
                  },
                },
              },
            });
            return { status: "executed" };
          },
        },
        sync: vi.fn(async () => undefined),
      } as never);
    });

    await expect(extractDesignContent([0, 1])).resolves.toEqual({
      pageIndices: [0, 1],
      segments: [
        { pageIndex: 0, text: "Hello" },
        { pageIndex: 0, text: "World" },
      ],
    });
  });

  it("remaps matched boxes to the Hyperlocalise source text", async () => {
    mockDesignPages([["Hola", "Edited"]]);
    await expect(
      extractDesignContent(
        [0],
        [
          pullPage({
            entries: [
              {
                key: "canva.t.hello",
                source: "Hello",
                target: "Hello",
                knownTexts: ["Hello", "Hola"],
              },
            ],
          }),
        ],
      ),
    ).resolves.toEqual({
      pageIndices: [0],
      segments: [
        { pageIndex: 0, text: "Hello" },
        { pageIndex: 0, text: "Edited" },
      ],
    });
  });

  it("keeps current text when the page needs a re-upload", async () => {
    mockDesignPages([["Hola"]]);
    await expect(
      extractDesignContent([0], [pullPage({ needsReupload: true, entries: [] })]),
    ).resolves.toEqual({
      pageIndices: [0],
      segments: [{ pageIndex: 0, text: "Hola" }],
    });
  });

  it("applies source, then another locale, then back to source on the same box", async () => {
    let current = "Hello";
    const { replacements, sync } = mockDesignPages([[current]], (_page, next) => {
      current = next;
    });
    const source: CanvaPullEntry = {
      key: "canva.t.hello",
      source: "Hello",
      target: "Hello",
      knownTexts: ["Hello", "สวัสดี", "Bonjour"],
    };
    const thai = { ...source, target: "สวัสดี" };
    const french = { ...source, target: "Bonjour" };

    await expect(applyTranslationsToDesign([pullPage({ entries: [thai] })])).resolves.toMatchObject(
      {
        replaced: 1,
      },
    );
    expect(replacements).toEqual(["สวัสดี"]);

    vi.mocked(openDesign).mockReset();
    const second = mockDesignPages([[current]], (_page, next) => {
      current = next;
    });
    await expect(
      applyTranslationsToDesign([pullPage({ entries: [french] })]),
    ).resolves.toMatchObject({ replaced: 1 });
    expect(second.replacements).toEqual(["Bonjour"]);

    vi.mocked(openDesign).mockReset();
    const third = mockDesignPages([[current]]);
    await expect(
      applyTranslationsToDesign([pullPage({ entries: [source] })]),
    ).resolves.toMatchObject({ replaced: 1 });
    expect(third.replacements).toEqual(["Hello"]);
    expect(sync).toHaveBeenCalled();
  });

  it("replaces the full text box when Canva exposes multiple styled regions", async () => {
    const regions = [{ text: "Buy " }, { text: "Now" }];
    const plaintext = "Buy Now";
    let replaced: { index: number; length: number; text: string } | null = null;

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
                        readPlaintext: () => plaintext,
                        readTextRegions: () => regions,
                        replaceText: (range: { index: number; length: number }, next: string) => {
                          replaced = { index: range.index, length: range.length, text: next };
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
        sync: vi.fn(async () => undefined),
      } as never);
    });

    await expect(
      applyTranslationsToDesign([
        pullPage({
          entries: [
            {
              key: "canva.t.buy-now",
              source: "Buy Now",
              target: "Achetez maintenant",
              knownTexts: ["Buy Now"],
            },
          ],
        }),
      ]),
    ).resolves.toMatchObject({ replaced: 1 });

    expect(replaced).toEqual({
      index: 0,
      length: plaintext.length,
      text: "Achetez maintenant",
    });
  });

  it("applies after boxes are reordered and to duplicate source text", async () => {
    const { replacements } = mockDesignPages([["World", "Hello", "Hello"]]);

    await expect(
      applyTranslationsToDesign([
        pullPage({
          entries: [
            {
              key: "canva.t.hello",
              source: "Hello",
              target: "Hola",
              knownTexts: ["Hello"],
            },
            {
              key: "canva.t.world",
              source: "World",
              target: "Mundo",
              knownTexts: ["World"],
            },
          ],
        }),
      ]),
    ).resolves.toMatchObject({ replaced: 3 });
    expect(replacements).toEqual(["Mundo", "Hola", "Hola"]);
  });

  it("counts skipped, untranslated, and already applied boxes", async () => {
    const { replacements } = mockDesignPages([["Edited", "Hello", "Hola"]]);

    await expect(
      applyTranslationsToDesign([
        pullPage({
          entries: [
            {
              key: "canva.t.hello",
              source: "Hello",
              target: "Hola",
              knownTexts: ["Hello", "Hola"],
            },
            {
              key: "canva.t.world",
              source: "World",
              target: null,
              knownTexts: ["World"],
            },
          ],
        }),
      ]),
    ).resolves.toEqual({
      replaced: 1,
      alreadyApplied: 1,
      skipped: 1,
      untranslated: 0,
      pagesNeedingUpload: [],
      appliedPageIndices: [0],
    });
    expect(replacements).toEqual(["Hola"]);
  });

  it("counts a missing target as untranslated", async () => {
    mockDesignPages([["Hello"]]);
    await expect(
      applyTranslationsToDesign([
        pullPage({
          entries: [
            {
              key: "canva.t.hello",
              source: "Hello",
              target: null,
              knownTexts: ["Hello"],
            },
          ],
        }),
      ]),
    ).resolves.toMatchObject({ untranslated: 1, replaced: 0 });
  });

  it("skips an ambiguous known translation", async () => {
    mockDesignPages([["OK"]]);
    await expect(
      applyTranslationsToDesign([
        pullPage({
          entries: [
            {
              key: "canva.t.a",
              source: "Accept",
              target: "OK",
              knownTexts: ["OK"],
            },
            {
              key: "canva.t.b",
              source: "Confirm",
              target: "OK",
              knownTexts: ["OK"],
            },
          ],
        }),
      ]),
    ).resolves.toMatchObject({ skipped: 1, replaced: 0 });
  });

  it("does not open pages that need a re-upload", async () => {
    const { replacements, sync } = mockDesignPages([["Hello"]]);
    await expect(
      applyTranslationsToDesign([pullPage({ needsReupload: true, entries: [] })]),
    ).resolves.toEqual({
      replaced: 0,
      alreadyApplied: 0,
      skipped: 0,
      untranslated: 0,
      pagesNeedingUpload: [0],
      appliedPageIndices: [],
    });
    expect(replacements).toEqual([]);
    expect(sync).not.toHaveBeenCalled();
    expect(openDesign).not.toHaveBeenCalled();
  });

  it("keeps source text when two keys share a later translation", () => {
    const index = buildApplyTextIndex([
      {
        key: "canva.t.a",
        source: "Accept",
        target: "OK",
        knownTexts: ["OK"],
      },
      {
        key: "canva.t.b",
        source: "Confirm",
        target: "OK",
        knownTexts: ["OK"],
      },
    ]);
    expect(index.get("Accept")?.key).toBe("canva.t.a");
    expect(index.get("Confirm")?.key).toBe("canva.t.b");
    expect(index.has("OK")).toBe(false);
  });
});
