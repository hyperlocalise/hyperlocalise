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

import { GUIDELINE_TEMPLATE_CONTENT } from "./guideline-text-document-template";

let editor: Editor | undefined;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

function createMarkdownEditor(markdown: string) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, Markdown],
    content: markdown,
    contentType: "markdown",
  });
  return editor;
}

describe("GUIDELINE_TEMPLATE_CONTENT", () => {
  it("round-trips through the shared MarkdownEditor schema", () => {
    const instance = createMarkdownEditor(GUIDELINE_TEMPLATE_CONTENT);
    const applied = instance.getMarkdown();

    expect(applied).toContain("# Brand Style and Content Guide");
    expect(applied).toContain("## 1. Brand Foundations");
    expect(applied).toContain("### Tone Matrix");
    expect(applied).toContain("**UI and Layout**");
    expect(applied).toContain("**Error Messages**");
    expect(applied).toContain("**Marketing and Docs**");
    expect(applied).toContain("**Dates/Time:**");
    expect(applied).toContain("`{userName}`");
    expect(applied).not.toContain("&amp;");
    expect(applied).not.toMatch(/\|[-: ]+\|/);

    instance.commands.setContent(applied, { contentType: "markdown" });
    expect(instance.getMarkdown().trim()).toBe(applied.trim());
    expect(applied.trim()).toBe(GUIDELINE_TEMPLATE_CONTENT.trim());
  });

  it("keeps nested format and translation rules as lists", () => {
    const instance = createMarkdownEditor(GUIDELINE_TEMPLATE_CONTENT);
    const json = JSON.stringify(instance.getJSON());

    expect(json).toContain("bulletList");
    expect(json).not.toContain('"type":"table"');
    expect(instance.getText()).toContain("Dates/Time");
    expect(instance.getText()).toContain("Text Expansion");
  });
});
