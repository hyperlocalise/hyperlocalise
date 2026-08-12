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
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";

import {
  insertMarkdownEditorImage,
  isAllowedMarkdownEditorImageFile,
  isValidMarkdownEditorImageSrc,
} from "./markdown-editor-image";

describe("markdown editor image helpers", () => {
  it("accepts png jpeg and webp files", () => {
    expect(isAllowedMarkdownEditorImageFile(new File([""], "a.png", { type: "image/png" }))).toBe(
      true,
    );
    expect(isAllowedMarkdownEditorImageFile(new File([""], "a.jpg", { type: "image/jpeg" }))).toBe(
      true,
    );
    expect(isAllowedMarkdownEditorImageFile(new File([""], "a.webp", { type: "image/webp" }))).toBe(
      true,
    );
    expect(isAllowedMarkdownEditorImageFile(new File([""], "a.gif", { type: "image/gif" }))).toBe(
      false,
    );
  });

  it("validates http https and org file proxy urls", () => {
    expect(isValidMarkdownEditorImageSrc("https://cdn.example/a.png")).toBe(true);
    expect(isValidMarkdownEditorImageSrc("/api/orgs/acme/files/file_1")).toBe(true);
    expect(isValidMarkdownEditorImageSrc("javascript:alert(1)")).toBe(false);
    expect(isValidMarkdownEditorImageSrc("data:image/png;base64,abc")).toBe(false);
  });

  it("inserts at a captured position even if selection moved", () => {
    const editor = new Editor({
      extensions: [StarterKit, Image.configure({ inline: false, allowBase64: false }), Markdown],
      content: "First paragraph\n\nSecond paragraph",
      contentType: "markdown",
    });

    // Start of the second paragraph — not the end-of-doc selection.
    let secondParagraphPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (
        secondParagraphPos === null &&
        node.type.name === "paragraph" &&
        node.textContent === "Second paragraph"
      ) {
        secondParagraphPos = pos + 1;
      }
    });
    expect(secondParagraphPos).not.toBeNull();

    const insertPos = secondParagraphPos!;
    editor.commands.setTextSelection(1);

    const nextPos = insertMarkdownEditorImage(editor, {
      src: "/api/orgs/acme/files/file_1",
      alt: "Banner",
      pos: insertPos,
    });
    expect(typeof nextPos).toBe("number");

    const markdown = editor.getMarkdown();
    // Image should land with the second paragraph, not at the moved caret in the first.
    expect(markdown.indexOf("First paragraph")).toBeLessThan(markdown.indexOf("![Banner]"));
    expect(markdown.indexOf("![Banner]")).toBeLessThan(markdown.indexOf("Second paragraph"));
    expect(markdown).not.toMatch(/^!\[Banner]/);

    editor.destroy();
  });

  it("keeps a multi-image sequence even if selection moves between inserts", () => {
    const editor = new Editor({
      extensions: [StarterKit, Image.configure({ inline: false, allowBase64: false }), Markdown],
      content: "First paragraph\n\nSecond paragraph",
      contentType: "markdown",
    });

    let secondParagraphPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (
        secondParagraphPos === null &&
        node.type.name === "paragraph" &&
        node.textContent === "Second paragraph"
      ) {
        secondParagraphPos = pos + 1;
      }
    });
    expect(secondParagraphPos).not.toBeNull();

    let insertPos = secondParagraphPos!;
    editor.commands.setTextSelection(1);

    const firstNext = insertMarkdownEditorImage(editor, {
      src: "/api/orgs/acme/files/file_1",
      alt: "One",
      pos: insertPos,
    });
    expect(typeof firstNext).toBe("number");
    insertPos = firstNext as number;

    // Simulate the user moving the caret while a later upload is pending.
    editor.commands.setTextSelection(1);

    const secondNext = insertMarkdownEditorImage(editor, {
      src: "/api/orgs/acme/files/file_2",
      alt: "Two",
      pos: insertPos,
    });
    expect(typeof secondNext).toBe("number");

    const markdown = editor.getMarkdown();
    const firstIdx = markdown.indexOf("![One]");
    const secondIdx = markdown.indexOf("![Two]");
    expect(firstIdx).toBeGreaterThan(markdown.indexOf("First paragraph"));
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(secondIdx).toBeLessThan(markdown.indexOf("Second paragraph"));
    expect(markdown).not.toMatch(/^!\[Two]/);

    editor.destroy();
  });
});

describe("markdown image round-trip", () => {
  it("parses and serializes image markdown through TipTap", () => {
    const markdown = '![Banner](/api/orgs/acme/files/file_1 "Hero")';
    const editor = new Editor({
      extensions: [StarterKit, Image.configure({ inline: false, allowBase64: false }), Markdown],
      content: markdown,
      contentType: "markdown",
    });

    let foundImage = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "image") {
        foundImage = true;
        expect(node.attrs.src).toBe("/api/orgs/acme/files/file_1");
        expect(node.attrs.alt).toBe("Banner");
        expect(node.attrs.title).toBe("Hero");
      }
    });
    expect(foundImage).toBe(true);

    const serialized = editor.getMarkdown().trim();
    expect(serialized).toContain("![Banner](/api/orgs/acme/files/file_1");
    expect(serialized).toContain("Hero");
    editor.destroy();
  });
});
