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
import { describe, expect, it } from "vite-plus/test";

import {
  alignDocumentBlocks,
  documentBlocksFromJson,
  documentHeadings,
  isUntranslatedBlock,
  type DocumentBlockSignature,
} from "./document-editor-blocks";

const h2 = (text: string): DocumentBlockSignature => ({ kind: "heading-2", text });
const p = (text: string): DocumentBlockSignature => ({ kind: "paragraph", text });

describe("alignDocumentBlocks", () => {
  it("aligns blocks with the same structure in order", () => {
    const source = [h2("Intro"), p("Hello"), p("World")];
    const target = [h2("Introduction"), p("Bonjour"), p("Monde")];

    expect(alignDocumentBlocks(source, target)).toEqual([0, 1, 2]);
  });

  it("leaves an inserted target block unmatched", () => {
    const source = [h2("Intro"), p("Hello"), h2("Next")];
    const target = [h2("Intro"), p("Bonjour"), { kind: "bulletList", text: "extra" }, h2("Suite")];

    expect(alignDocumentBlocks(source, target)).toEqual([0, 1, null, 2]);
  });

  it("skips a source block the translation dropped", () => {
    const source = [p("One"), h2("Two"), p("Three")];
    const target = [p("Un"), p("Trois")];

    expect(alignDocumentBlocks(source, target)).toEqual([0, 2]);
  });

  it("uses shared numbers and links to pick between same-kind blocks", () => {
    const source = [p("Call 555 0100"), p("See https://example.com")];
    const target = [p("Voir https://example.com")];

    expect(alignDocumentBlocks(source, target)).toEqual([1]);
  });

  it("returns no matches without a source", () => {
    expect(alignDocumentBlocks([], [p("x")])).toEqual([null]);
  });
});

describe("documentBlocksFromJson", () => {
  it("reads kinds and text from top-level nodes", () => {
    const blocks = documentBlocksFromJson({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world", marks: [{ type: "bold" }] },
          ],
        },
      ],
    });

    expect(blocks).toEqual([h2("Title"), p("Hello world")]);
    expect(documentHeadings(blocks)).toEqual([{ blockIndex: 0, level: 2, text: "Title" }]);
  });
});

describe("isUntranslatedBlock", () => {
  it("flags text identical to its source", () => {
    expect(isUntranslatedBlock(p("Hello"), p("Hello"))).toBe(true);
    expect(isUntranslatedBlock(p("Bonjour"), p("Hello"))).toBe(false);
  });

  it("ignores blocks without words", () => {
    expect(isUntranslatedBlock(p("2026"), p("2026"))).toBe(false);
    expect(isUntranslatedBlock(p("Hello"), undefined)).toBe(false);
  });
});
