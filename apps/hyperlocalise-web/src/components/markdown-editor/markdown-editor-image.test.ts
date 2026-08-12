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
