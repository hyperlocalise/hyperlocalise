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
      expect(
        screen.getByRole("heading", { level: 1, name: "Hello from source" }),
      ).toBeInTheDocument();
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
      expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("heading", { level: 1, name: "Source body" }),
    ).not.toBeInTheDocument();
  });

  it("saves markdown document edits on save", async () => {
    const user = userEvent.setup();
    const markdownBody = `---
title: Guide
---

# Guide

Translate this paragraph.
`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(markdownBody, { status: 200 })),
    );
    const onSave = vi.fn<(file: File) => Promise<void>>(async () => undefined);

    render(
      <ContentEditorTestProviders>
        <ContentEditorDocumentFileViewerPane
          role="target"
          src="https://example.com/guide.md"
          filename="guide.md"
          onSave={onSave}
        />
      </ContentEditorTestProviders>,
    );

    const titleField = await screen.findByLabelText("title");
    const saveButton = screen.getByRole("button", { name: /save edits/i });
    expect(saveButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
    await screen.findByRole("heading", { level: 1, name: "Guide" });
    await user.clear(titleField);
    await user.type(titleField, "Updated Guide");
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const savedFile = onSave.mock.calls[0]?.[0];
    expect(savedFile).toBeInstanceOf(File);
    const savedText = await savedFile!.text();
    expect(savedText).toContain("title: Updated Guide");
    expect(savedText).toContain("# Guide");
    expect(savedText).toContain("Translate this paragraph.");
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
    const saveButton = screen.getByRole("button", { name: /save edits/i });
    expect(editor).toHaveValue(mdxBody);
    expect(saveButton).toBeDisabled();

    await user.type(editor, " Updated.");
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

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

  it("collapses and expands document frontmatter fields", async () => {
    const user = userEvent.setup();
    const markdownBody = `---
title: Guide
description: Intro
---

# Guide
`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(markdownBody, { status: 200 })),
    );

    render(
      <ContentEditorTestProviders>
        <ContentEditorDocumentFileViewerPane
          role="target"
          src="https://example.com/guide.md"
          filename="guide.md"
        />
      </ContentEditorTestProviders>,
    );

    const titleField = await screen.findByLabelText("title");
    expect(titleField).toBeVisible();

    await user.click(screen.getByRole("button", { name: /Document properties/i }));
    expect(titleField).not.toBeVisible();

    await user.click(screen.getByRole("button", { name: /Document properties/i }));
    expect(screen.getByLabelText("title")).toBeVisible();
  });

  it("renders read-only panes as a formatted preview instead of raw markup", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("# Heading\n\nSome [link](https://example.com).\n", {
            status: 200,
          }),
      ),
    );

    render(
      <ContentEditorTestProviders>
        <ContentEditorDocumentFileViewerPane
          role="source"
          src="https://example.com/source.md"
          filename="intro.md"
          canEdit={false}
        />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Heading" })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "link" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(screen.queryByLabelText("Translated document")).not.toBeInTheDocument();
  });
});
