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
import { useState } from "react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { MarkdownSelectionAi } from "./markdown-selection-ai";
import type { MarkdownSelectionAiConfig } from "./markdown-selection-ai.types";

let editor: Editor;
afterEach(() => editor?.destroy());

function Host({ request }: { request: MarkdownSelectionAiConfig["request"] }) {
  const [open, setOpen] = useState(false);
  return (
    <ContentEditorTestProviders>
      <MarkdownSelectionAi
        editor={editor}
        config={{ sourceLocale: "en", targetLocale: "fr", request }}
        open={open}
        onOpenChange={setOpen}
      />
    </ContentEditorTestProviders>
  );
}

function setup(request: MarkdownSelectionAiConfig["request"]) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit],
    content: "<p>Before selected after</p>",
  });
  editor.commands.setTextSelection({ from: 8, to: 16 });
  render(<Host request={request} />);
}

describe("MarkdownSelectionAi", () => {
  it("requests AI with selection context and only replaces the selection after approval", async () => {
    const user = userEvent.setup();
    const request = vi
      .fn()
      .mockResolvedValue({ suggestion: "improved <b>text</b>", reasoning: "More fluent." });
    setup(request);
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(request).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Rewrite" }));
    const apply = await screen.findByRole("button", { name: "Replace" });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedText: "selected",
        documentContext: "Before selected after",
      }),
    );
    expect(editor.getText()).toBe("Before selected after");
    await user.click(apply);
    expect(editor.getText()).toBe("Before improved <b>text</b> after");
    expect(editor.getHTML()).toContain("&lt;b&gt;");
  });

  it("shows loading after choosing an action, then displays the result", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (result: { suggestion: string; reasoning: string }) => void;
    const request = vi.fn(
      () =>
        new Promise<{ suggestion: string; reasoning: string }>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    setup(request);
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(request).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Retranslate" }));
    expect(screen.getByRole("status")).toHaveTextContent("Reviewing the selected text");
    expect(screen.queryByRole("button", { name: "Rewrite" })).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ instruction: expect.stringContaining("Retranslate") }),
    );
    await act(async () =>
      resolveRequest({ suggestion: "translated", reasoning: "Based on the original." }),
    );
    expect(await screen.findByRole("button", { name: "Replace" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(editor.getText()).toBe("Before selected after");
  });

  it("refuses to apply a stale suggestion after the document changes", async () => {
    const user = userEvent.setup();
    setup(vi.fn().mockResolvedValue({ suggestion: "improved", reasoning: "More fluent." }));
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(screen.getByRole("button", { name: "Rewrite" }));
    const apply = await screen.findByRole("button", { name: "Replace" });
    act(() => {
      editor.commands.insertContentAt(1, "New ");
    });
    await user.click(apply);
    expect(screen.getByRole("alert")).toHaveTextContent("The document changed");
    expect(editor.getText()).toBe("New Before selected after");
  });

  it("keeps the document intact when AI fails and lets the reviewer retry", async () => {
    const user = userEvent.setup();
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({ suggestion: "improved", reasoning: "Corrected grammar." });
    setup(request);
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(screen.getByRole("button", { name: "Rewrite" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not get a suggestion");
    expect(editor.getText()).toBe("Before selected after");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Replace" })).toBeEnabled());
    expect(request).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(editor.getText()).toBe("Before selected after");
  });
});
