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
// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { documentBlocksFromJson } from "./document-editor-blocks";
import {
  createDocumentSchemaExtensions,
  parseDocumentMarkdown,
} from "./document-editor-extensions";
import {
  buildDocumentBlockSuggestion,
  planDocumentTranslation,
  untranslatedDocumentBlocks,
} from "./document-editor-translate";

const SOURCE = [
  "# Getting started",
  "",
  "Install the CLI first.",
  "",
  "```sh",
  "npm i hyperlocalise",
  "```",
  "",
  "Then run it.",
].join("\n");

let editor: Editor;
afterEach(() => editor?.destroy());

function setup(markdown: string) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: createDocumentSchemaExtensions("markdown"),
    content: markdown,
    contentType: "markdown",
  });
  return editor;
}

describe("planDocumentTranslation", () => {
  it("skips code and already translated blocks in the untranslated scope", () => {
    const target = SOURCE.replace("Install the CLI first.", "Installez d'abord la CLI.");
    setup(target);
    const sourceDoc = parseDocumentMarkdown(SOURCE, "markdown");

    expect(planDocumentTranslation(sourceDoc, editor.state.doc, "untranslated")).toEqual([
      { sourceIndex: 0, targetIndex: 0 },
      { sourceIndex: 3, targetIndex: 3 },
    ]);
    expect(planDocumentTranslation(sourceDoc, editor.state.doc, "all")).toHaveLength(3);
  });

  it("flags blocks that still read as the source", () => {
    setup(SOURCE.replace("Then run it.", "Puis lancez-la."));
    const sourceBlocks = documentBlocksFromJson(parseDocumentMarkdown(SOURCE, "markdown"));

    expect([...untranslatedDocumentBlocks(sourceBlocks, editor.state.doc)]).toEqual([0, 1]);
  });
});

describe("buildDocumentBlockSuggestion", () => {
  it("targets the block aligned to the source even after blocks were inserted", () => {
    setup(SOURCE);
    const sourceBlocks = documentBlocksFromJson(parseDocumentMarkdown(SOURCE, "markdown"));
    editor.commands.insertContentAt(0, {
      type: "paragraph",
      content: [{ type: "text", text: "Intro" }],
    });

    const suggestion = buildDocumentBlockSuggestion({
      id: "s1",
      doc: editor.state.doc,
      sourceBlocks,
      sourceIndex: 3,
      replacement: [{ type: "paragraph", content: [{ type: "text", text: "Puis lancez-la." }] }],
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion?.originalText).toBe("Then run it.");
    expect(editor.state.doc.textBetween(suggestion!.from, suggestion!.to)).toBe("Then run it.");
  });

  it("returns null when the block changed after the request was sent", () => {
    setup(SOURCE);
    const sourceBlocks = documentBlocksFromJson(parseDocumentMarkdown(SOURCE, "markdown"));

    expect(
      buildDocumentBlockSuggestion({
        id: "s1",
        doc: editor.state.doc,
        sourceBlocks,
        sourceIndex: 3,
        replacement: [{ type: "paragraph", content: [{ type: "text", text: "Puis lancez-la." }] }],
        expectedOriginalText: "Then run it. edited",
      }),
    ).toBeNull();
  });

  it("returns null when the replacement changes nothing", () => {
    setup(SOURCE);
    const sourceBlocks = documentBlocksFromJson(parseDocumentMarkdown(SOURCE, "markdown"));

    expect(
      buildDocumentBlockSuggestion({
        id: "s1",
        doc: editor.state.doc,
        sourceBlocks,
        sourceIndex: 3,
        replacement: [{ type: "paragraph", content: [{ type: "text", text: "Then run it." }] }],
      }),
    ).toBeNull();
  });
});
