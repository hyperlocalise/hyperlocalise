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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorDocumentFileViewerPane } from "./content-editor-document-file-viewer";

vi.mock("@/components/markdown-editor/markdown-editor", () => ({
  MarkdownEditor: ({ value }: { value: string }) => (
    <textarea aria-label="Translated document" defaultValue={value} />
  ),
  MarkdownPreview: ({ value }: { value: string }) => <div>{value}</div>,
}));

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
});
