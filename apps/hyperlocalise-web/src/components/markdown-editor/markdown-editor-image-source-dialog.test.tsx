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

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import {
  insertMarkdownEditorImageViaSourceDialog,
  promptMarkdownEditorImageSource,
  type MarkdownEditorImageSourceLabels,
} from "./markdown-editor-image-source-dialog";

const labels: MarkdownEditorImageSourceLabels = {
  title: "Insert image",
  upload: "Upload image",
  enterUrl: "Enter URL",
  urlLabel: "Enter image URL",
  urlPlaceholder: "https://",
  insert: "Insert",
  cancel: "Cancel",
};

describe("promptMarkdownEditorImageSource", () => {
  it("resolves upload when upload is chosen", async () => {
    const user = userEvent.setup();
    const resultPromise = promptMarkdownEditorImageSource(labels, { allowUpload: true });

    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Upload image" }));

    await expect(resultPromise).resolves.toEqual({ kind: "upload" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("resolves a valid url from the url step", async () => {
    const user = userEvent.setup();
    const resultPromise = promptMarkdownEditorImageSource(labels, { allowUpload: true });

    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Enter URL" }));

    const input = await screen.findByLabelText("Enter image URL");
    await user.clear(input);
    await user.type(input, "https://cdn.example/a.png");
    await user.click(screen.getByRole("button", { name: "Insert" }));

    await expect(resultPromise).resolves.toEqual({
      kind: "url",
      src: "https://cdn.example/a.png",
    });
  });

  it("opens on the url step when upload is disabled", async () => {
    const user = userEvent.setup();
    const resultPromise = promptMarkdownEditorImageSource(labels, { allowUpload: false });

    expect(await screen.findByLabelText("Enter image URL")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload image" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await expect(resultPromise).resolves.toBeNull();
  });

  it("keeps Insert disabled for invalid urls", async () => {
    const user = userEvent.setup();
    const resultPromise = promptMarkdownEditorImageSource(labels, { allowUpload: false });

    const input = await screen.findByLabelText("Enter image URL");
    await user.clear(input);
    await user.type(input, "javascript:alert(1)");

    expect(screen.getByRole("button", { name: "Insert" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await expect(resultPromise).resolves.toBeNull();
  });

  it("resolves null on cancel without leaving a dialog open", async () => {
    const user = userEvent.setup();
    const resultPromise = promptMarkdownEditorImageSource(labels, { allowUpload: true });

    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await expect(resultPromise).resolves.toBeNull();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});

describe("insertMarkdownEditorImageViaSourceDialog", () => {
  it("inserts at the remapped anchor when the doc changes while the dialog is open", async () => {
    const user = userEvent.setup();
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

    const insertPromise = insertMarkdownEditorImageViaSourceDialog(editor, labels, {
      allowUpload: false,
      pos: secondParagraphPos!,
    });

    const input = await screen.findByLabelText("Enter image URL");
    editor.view.dispatch(editor.state.tr.insertText("PREFIX ", 1));
    editor.commands.setTextSelection(1);

    await user.clear(input);
    await user.type(input, "https://cdn.example/a.png");
    await user.click(screen.getByRole("button", { name: "Insert" }));

    await expect(insertPromise).resolves.toBe(true);

    const markdown = editor.getMarkdown();
    expect(markdown).toContain("PREFIX");
    expect(markdown.indexOf("First paragraph")).toBeLessThan(markdown.indexOf("![]("));
    expect(markdown.indexOf("![](")).toBeLessThan(markdown.indexOf("Second paragraph"));
    expect(markdown).toContain("https://cdn.example/a.png");

    editor.destroy();
  });
});
