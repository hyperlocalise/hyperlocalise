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
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  serializeMarkdownRange,
  serializeMarkdownSelectionContext,
  unwrapFencedMarkdown,
} from "./markdown-selection-ai-markdown";

let editor: Editor;
afterEach(() => editor?.destroy());

function createEditor(markdown: string) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, Markdown],
    content: markdown,
    contentType: "markdown",
  });
  return editor;
}

function findText(instance: Editor, text: string) {
  let from = -1;
  let to = -1;
  instance.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text || from !== -1) {
      return;
    }
    const index = node.text.indexOf(text);
    if (index !== -1) {
      from = pos + index;
      to = from + text.length;
    }
  });
  return { from, to };
}

describe("serializeMarkdownRange", () => {
  it("serializes bold, italic, and links in the selected range", () => {
    const instance = createEditor(
      "Before **selected** and *more* plus [linked](https://example.com) after",
    );
    const bold = findText(instance, "selected");
    expect(serializeMarkdownRange(instance, bold.from, bold.to)).toBe("**selected**");

    const italic = findText(instance, "more");
    expect(serializeMarkdownRange(instance, italic.from, italic.to)).toBe("*more*");

    const linked = findText(instance, "linked");
    expect(serializeMarkdownRange(instance, linked.from, linked.to)).toBe(
      "[linked](https://example.com)",
    );
  });

  it("includes surrounding Markdown when building request context", () => {
    const instance = createEditor("Before **selected** after");
    const selected = findText(instance, "selected");
    const selectedMarkdown = serializeMarkdownRange(instance, selected.from, selected.to);
    expect(
      serializeMarkdownSelectionContext(
        instance,
        selected.from,
        selected.to,
        selectedMarkdown,
        16_384,
      ),
    ).toBe("Before **selected** after");
  });
});

describe("unwrapFencedMarkdown", () => {
  it("removes a wrapping Markdown fence", () => {
    expect(unwrapFencedMarkdown("```markdown\n**bonjour**\n```")).toBe("**bonjour**");
    expect(unwrapFencedMarkdown("**bonjour**")).toBe("**bonjour**");
  });
});
