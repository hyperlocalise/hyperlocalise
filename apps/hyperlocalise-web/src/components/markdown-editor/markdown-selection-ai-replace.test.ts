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

import { replaceMarkdownSelection } from "./markdown-selection-ai-replace";

let editor: Editor;
afterEach(() => editor?.destroy());

function createEditor(content: string, contentType: "html" | "markdown" = "html") {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, Markdown],
    content,
    contentType,
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

describe("replaceMarkdownSelection", () => {
  it("keeps a heading when replacing text inside it", () => {
    const instance = createEditor("<h1>Title text</h1>");
    const title = findText(instance, "Title");
    replaceMarkdownSelection(instance, title.from, title.to, "Nouveau");
    expect(instance.getHTML()).toContain("<h1>");
    expect(instance.getHTML()).toContain("Nouveau text");
    expect(instance.getHTML()).not.toContain("Title");
  });

  it("keeps shared marks when replacing fully marked text", () => {
    const instance = createEditor("<p>Before <strong>selected</strong> after</p>");
    const selected = findText(instance, "selected");
    replaceMarkdownSelection(instance, selected.from, selected.to, "improved");
    expect(instance.getHTML()).toContain("<strong>improved</strong>");
    expect(instance.getText()).toBe("Before improved after");
  });

  it("applies Markdown bold and italic from the model output", () => {
    const instance = createEditor("Before selected after", "markdown");
    const selected = findText(instance, "selected");
    replaceMarkdownSelection(instance, selected.from, selected.to, "**improved** *text*");
    expect(instance.getHTML()).toContain("<strong>improved</strong>");
    expect(instance.getHTML()).toContain("<em>text</em>");
    expect(instance.getText()).toBe("Before improved text after");
  });

  it("applies Markdown links from the model output", () => {
    const instance = createEditor("Before selected after", "markdown");
    const selected = findText(instance, "selected");
    replaceMarkdownSelection(
      instance,
      selected.from,
      selected.to,
      "[improved](https://example.com)",
    );
    expect(instance.getHTML()).toContain('href="https://example.com"');
    expect(instance.getText()).toBe("Before improved after");
  });

  it("keeps relative Markdown links", () => {
    const instance = createEditor("Before selected after", "markdown");
    const selected = findText(instance, "selected");
    replaceMarkdownSelection(instance, selected.from, selected.to, "[guide](../docs/guide.md)");
    expect(instance.getHTML()).toContain('href="../docs/guide.md"');
    expect(instance.getText()).toBe("Before guide after");
  });

  it("drops javascript links while keeping the link label", () => {
    const instance = createEditor("Before selected after", "markdown");
    const selected = findText(instance, "selected");
    replaceMarkdownSelection(
      instance,
      selected.from,
      selected.to,
      "[improved](javascript:alert(1))",
    );
    expect(instance.getHTML()).not.toContain("javascript:");
    expect(instance.getText()).toBe("Before improved after");
  });

  it("unwraps fenced Markdown before applying formatting", () => {
    const instance = createEditor("Before selected after", "markdown");
    const selected = findText(instance, "selected");
    replaceMarkdownSelection(
      instance,
      selected.from,
      selected.to,
      "```markdown\n**improved**\n```",
    );
    expect(instance.getHTML()).toContain("<strong>improved</strong>");
    expect(instance.getText()).toBe("Before improved after");
  });

  it("replaces across paragraphs without collapsing their block structure", () => {
    const instance = createEditor("<p>Hello world</p><p>Second para</p>");
    const world = findText(instance, "world");
    const second = findText(instance, "Second");
    replaceMarkdownSelection(instance, world.from, second.to, "monde\nDeuxieme");
    expect(instance.getHTML()).toContain("<p>Hello monde</p>");
    expect(instance.getHTML()).toContain("<p>Deuxieme para</p>");
    expect(instance.getHTML()).not.toContain("<br");
    expect(instance.getText()).toBe("Hello monde\n\nDeuxieme para");
  });

  it("maps blank-line Markdown paragraphs onto the selected blocks", () => {
    const instance = createEditor("<p>Hello world</p><p>Second para</p><p>Third para</p>");
    const world = findText(instance, "world");
    const third = findText(instance, "Third");
    replaceMarkdownSelection(instance, world.from, third.to, "monde\n\nDeuxieme\n\nTroisieme");
    expect(instance.getHTML()).toContain("<p>Hello monde</p>");
    expect(instance.getHTML()).toContain("<p>Deuxieme</p>");
    expect(instance.getHTML()).toContain("<p>Troisieme para</p>");
    expect(instance.getHTML()).not.toContain("<br");
    expect(instance.getText()).toBe("Hello monde\n\nDeuxieme\n\nTroisieme para");
  });

  it("keeps a list item when replacing its selected wording", () => {
    const instance = createEditor("<ul><li><p>Keep this item</p></li></ul>");
    const keep = findText(instance, "Keep this");
    replaceMarkdownSelection(instance, keep.from, keep.to, "Retain that");
    expect(instance.getHTML()).toContain("<li>");
    expect(instance.getHTML()).toContain("Retain that item");
    expect(instance.getHTML()).not.toContain("Keep this");
  });

  it("never parses model output as HTML", () => {
    const instance = createEditor("<p>Before selected after</p>");
    const selected = findText(instance, "selected");
    replaceMarkdownSelection(instance, selected.from, selected.to, "improved <b>text</b>");
    expect(instance.getHTML()).toContain("&lt;b&gt;");
    expect(instance.getText()).toBe("Before improved <b>text</b> after");
  });

  it("applies Markdown marks when the same line also has a literal HTML tag", () => {
    const instance = createEditor("Before selected after", "markdown");
    const selected = findText(instance, "selected");
    replaceMarkdownSelection(instance, selected.from, selected.to, "**improved** <b>text</b>");
    expect(instance.getHTML()).toContain("<strong>improved</strong>");
    expect(instance.getHTML()).toContain("&lt;b&gt;");
    expect(instance.getText()).toBe("Before improved <b>text</b> after");
  });

  it("keeps literal HTML placeholder text that already appears in the suggestion", () => {
    const instance = createEditor("Before selected after", "markdown");
    const selected = findText(instance, "selected");
    replaceMarkdownSelection(instance, selected.from, selected.to, "<b>ok</b> @@HLHTML_0@@");
    expect(instance.getText()).toBe("Before <b>ok</b> @@HLHTML_0@@ after");
  });

  it("applies a fenced code suggestion instead of inserting fence markers", () => {
    const instance = createEditor("Before selected after", "markdown");
    const selected = findText(instance, "selected");
    replaceMarkdownSelection(instance, selected.from, selected.to, "```js\nfoo()\n```");
    expect(instance.getText()).toBe("Before foo() after");
    expect(instance.getHTML()).not.toContain("```");
  });
});
