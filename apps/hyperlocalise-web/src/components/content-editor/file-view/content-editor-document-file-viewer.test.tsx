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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorDocumentFileViewerPane } from "./content-editor-document-file-viewer";

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ContentEditorDocumentFileViewerPane", () => {
  it("seeds from source only when the target file is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.includes("source.md")) {
          return new Response("# Hello from source\n", { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const { rerender } = render(
      <ContentEditorTestProviders>
        <ContentEditorDocumentFileViewerPane
          role="target"
          filename="intro.md"
          seedSrc="https://example.com/source.md"
        />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Translated document")).toHaveValue("# Hello from source\n");
    });

    rerender(
      <ContentEditorTestProviders>
        <ContentEditorDocumentFileViewerPane
          role="target"
          src="https://example.com/target.md"
          seedSrc="https://example.com/source.md"
          filename="intro.md"
        />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByText("Could not load the translated file")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Translated document")).not.toBeInTheDocument();
  });

  it("keeps an empty successful target instead of seeding source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.includes("target.md")) {
          return new Response("", { status: 200 });
        }
        return new Response("# Source body\n", { status: 200 });
      }),
    );

    render(
      <ContentEditorTestProviders>
        <ContentEditorDocumentFileViewerPane
          role="target"
          src="https://example.com/target.md"
          seedSrc="https://example.com/source.md"
          filename="intro.md"
        />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Translated document")).toHaveValue("");
    });
    expect(screen.queryByDisplayValue("# Source body")).not.toBeInTheDocument();
  });

  it("preserves MDX JSX and raw HTML when saving after an edit", async () => {
    const user = userEvent.setup();
    const mdxBody = '# Guide\n\n<Callout type="info">Tip</Callout>\n\nPress <kbd>Esc</kbd>.\n';
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(mdxBody, { status: 200 })),
    );
    const onSave = vi.fn<(file: File) => Promise<void>>(async () => undefined);

    render(
      <ContentEditorTestProviders>
        <ContentEditorDocumentFileViewerPane
          role="target"
          src="https://example.com/guide.mdx"
          filename="guide.mdx"
          onSave={onSave}
        />
      </ContentEditorTestProviders>,
    );

    const editor = await screen.findByLabelText("Translated document");
    expect(editor).toHaveValue(mdxBody);

    await user.type(editor, " Updated.");
    await user.click(screen.getByRole("button", { name: /save edits/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const savedFile = onSave.mock.calls[0]?.[0];
    expect(savedFile).toBeInstanceOf(File);
    const savedText = await savedFile!.text();
    expect(savedText).toContain('<Callout type="info">Tip</Callout>');
    expect(savedText).toContain("<kbd>Esc</kbd>");
    expect(savedText).not.toContain("&lt;Callout");
    expect(savedText).not.toContain("&lt;kbd");
    expect(savedText).toContain("Updated.");
  });
});
