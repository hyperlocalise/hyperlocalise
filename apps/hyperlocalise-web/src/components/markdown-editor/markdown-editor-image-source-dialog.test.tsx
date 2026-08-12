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
import { describe, expect, it } from "vite-plus/test";

import {
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
