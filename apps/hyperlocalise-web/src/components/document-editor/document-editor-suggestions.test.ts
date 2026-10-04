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

import { createDocumentSchemaExtensions } from "./document-editor-extensions";
import {
  DocumentSuggestions,
  acceptDocumentSuggestions,
  addDocumentSuggestions,
  getDocumentSuggestions,
  rejectDocumentSuggestions,
  type DocumentSuggestion,
} from "./document-editor-suggestions";

let editor: Editor;
afterEach(() => editor?.destroy());

function setup(markdown: string) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [...createDocumentSchemaExtensions("markdown"), DocumentSuggestions],
    content: markdown,
    contentType: "markdown",
  });
  return editor;
}

function suggestionForBlock(index: number, replacement: string): DocumentSuggestion {
  let from = 0;
  editor.state.doc.forEach((_node, offset, nodeIndex) => {
    if (nodeIndex === index) from = offset;
  });
  const node = editor.state.doc.child(index);
  return {
    id: `s${index}`,
    from,
    to: from + node.nodeSize,
    originalText: node.textContent,
    replacement: [{ type: "paragraph", content: [{ type: "text", text: replacement }] }],
    replacementText: replacement,
    status: "pending",
  };
}

describe("document suggestions", () => {
  it("does not change the document until accepted", () => {
    setup("Hello\n\nWorld");
    addDocumentSuggestions(editor, [suggestionForBlock(0, "Bonjour")]);

    expect(editor.getMarkdown()).toBe("Hello\n\nWorld");
    expect(editor.view.dom.querySelector(".document-suggestion-card ins")?.textContent).toBe(
      "Bonjour",
    );

    acceptDocumentSuggestions(editor, ["s0"]);
    expect(editor.getMarkdown()).toBe("Bonjour\n\nWorld");
    expect(getDocumentSuggestions(editor.state)).toEqual([]);
  });

  it("accepts several suggestions as one undoable step", () => {
    setup("Hello\n\nWorld");
    addDocumentSuggestions(editor, [
      suggestionForBlock(0, "Bonjour"),
      suggestionForBlock(1, "Monde"),
    ]);

    acceptDocumentSuggestions(editor, ["s0", "s1"]);
    expect(editor.getMarkdown()).toBe("Bonjour\n\nMonde");

    editor.commands.undo();
    expect(editor.getMarkdown()).toBe("Hello\n\nWorld");
  });

  it("marks a suggestion outdated when its block is edited", () => {
    setup("Hello\n\nWorld");
    addDocumentSuggestions(editor, [suggestionForBlock(1, "Monde")]);

    editor.commands.insertContentAt(1, "Oh ");
    expect(getDocumentSuggestions(editor.state)[0]?.status).toBe("pending");

    const [suggestion] = getDocumentSuggestions(editor.state);
    editor.commands.insertContentAt(suggestion!.from + 1, "Big ");
    expect(getDocumentSuggestions(editor.state)[0]?.status).toBe("outdated");
    expect(acceptDocumentSuggestions(editor, ["s1"])).toBe(false);
  });

  it("removes rejected suggestions", () => {
    setup("Hello");
    addDocumentSuggestions(editor, [suggestionForBlock(0, "Bonjour")]);

    rejectDocumentSuggestions(editor, ["s0"]);
    expect(getDocumentSuggestions(editor.state)).toEqual([]);
    expect(editor.getMarkdown()).toBe("Hello");
  });
});
