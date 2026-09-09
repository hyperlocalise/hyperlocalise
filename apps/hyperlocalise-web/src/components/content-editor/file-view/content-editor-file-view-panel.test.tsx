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

import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";

import { ContentEditorFileViewPanel } from "./content-editor-file-view-panel";
import { writeCatFileViewSourcePaneVisible } from "./content-editor-file-view-source-pane";

// Presence animation is checked in the browser; these tests verify panel state.
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
}));

function imageSegment(overrides: Partial<ContentEditorSegment> = {}): ContentEditorSegment {
  return {
    id: "img-1",
    index: 1,
    key: "assets/hero.png",
    sourceText: "assets/hero.png",
    targetText: "",
    sourcePath: "assets/hero.png",
    sourceLocale: "en",
    targetLocale: "de",
    status: "needs_review",
    contentKind: "image_file",
    sourceAssetUrl: "https://example.com/source.png",
    targetAssetUrl: "https://example.com/target.png",
    ...overrides,
  };
}

describe("ContentEditorFileViewPanel", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    writeCatFileViewSourcePaneVisible(true);
  });

  it("focuses the document, compares the original, and blocks approval until edits are saved", async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem("content-editor-file-view:source-pane:v1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("# Guide\n\nParagraph.\n")),
    );
    const onUpload = vi.fn(async () => undefined);
    render(
      <ContentEditorTestProviders>
        <ContentEditorFileViewPanel
          segment={imageSegment({ contentKind: "document", sourcePath: "guide.md" })}
          viewerId="markdown"
          onUpload={onUpload}
          onApprove={vi.fn()}
        />
      </ContentEditorTestProviders>,
    );
    const editor = await screen.findByLabelText("Translated document");
    const approve = screen.getByRole("button", { name: "Approve" });
    await waitFor(() => expect(approve).toBeEnabled());
    expect(screen.queryByRole("heading", { name: "Source (en)" })).not.toBeInTheDocument();
    await user.click(editor);
    await user.keyboard("!");
    await waitFor(() => expect(approve).toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Compare original" }));
    expect(screen.getByRole("heading", { name: "Source (en)" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close comparison" }));
    expect(screen.getByLabelText("Translated document")).toBe(editor);
    expect(approve).toBeDisabled();
    const save = screen.getByRole("button", { name: /save edits/i });
    expect(save.closest("header")).not.toBeNull();
    await user.click(save);
    await waitFor(() => expect(approve).toBeEnabled());
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it("renders source pane before translated pane", () => {
    render(
      <ContentEditorTestProviders>
        <ContentEditorFileViewPanel segment={imageSegment()} viewerId="image" filename="hero.png" />
      </ContentEditorTestProviders>,
    );

    expect(screen.getByRole("heading", { name: /Localised · de/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /(?:Source \(en\)|Original · en)/i }),
    ).toBeInTheDocument();
    expect(screen.getByAltText("Localised image")).toHaveAttribute(
      "src",
      "https://example.com/target.png",
    );
    expect(screen.getByAltText("Original image")).toHaveAttribute(
      "src",
      "https://example.com/source.png",
    );

    const sourceHeading = screen.getByRole("heading", { name: /(?:Source \(en\)|Original · en)/i });
    const translatedHeading = screen.getByRole("heading", { name: /Localised · de/i });
    expect(
      sourceHeading.compareDocumentPosition(translatedHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("uploads a translated image file", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();

    render(
      <ContentEditorTestProviders>
        <ContentEditorFileViewPanel
          segment={imageSegment({ targetAssetUrl: null })}
          viewerId="image"
          onUpload={onUpload}
        />
      </ContentEditorTestProviders>,
    );

    const file = new File(["png"], "de-hero.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    await user.upload(input as HTMLInputElement, file);

    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it("shows unsupported preview when no viewer is registered", () => {
    render(
      <ContentEditorTestProviders>
        <ContentEditorFileViewPanel segment={imageSegment()} viewerId={null} />
      </ContentEditorTestProviders>,
    );

    expect(
      screen.getAllByText("Preview is not available for this file type yet.").length,
    ).toBeGreaterThan(0);
  });

  it("prefers the segment source path over an aggregate filename", () => {
    render(
      <ContentEditorTestProviders>
        <ContentEditorFileViewPanel
          segment={imageSegment({ sourcePath: "marketing/hero.png" })}
          viewerId="image"
          filename="All Files"
        />
      </ContentEditorTestProviders>,
    );

    expect(screen.getByText("marketing/hero.png")).toBeInTheDocument();
    expect(screen.queryByText("All Files")).not.toBeInTheDocument();
  });

  it("navigates previous and next files", async () => {
    const user = userEvent.setup();
    const onPrevious = vi.fn();
    const onNext = vi.fn();

    render(
      <ContentEditorTestProviders>
        <ContentEditorFileViewPanel
          segment={imageSegment()}
          viewerId="image"
          hasPreviousSegment
          hasNextSegment
          onPrevious={onPrevious}
          onNext={onNext}
        />
      </ContentEditorTestProviders>,
    );

    await user.click(screen.getByRole("button", { name: /Previous file/i }));
    await user.click(screen.getByRole("button", { name: /Next file/i }));

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("closes comparison when entering a markdown viewer without a saved preference", () => {
    window.localStorage.removeItem("content-editor-file-view:source-pane:v1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("# Guide\n\nParagraph.\n")),
    );
    const { rerender } = render(
      <ContentEditorTestProviders>
        <ContentEditorFileViewPanel segment={imageSegment()} viewerId="image" filename="hero.png" />
      </ContentEditorTestProviders>,
    );

    expect(
      screen.getByRole("heading", { name: /(?:Source \(en\)|Original · en)/i }),
    ).toBeInTheDocument();

    rerender(
      <ContentEditorTestProviders>
        <ContentEditorFileViewPanel
          segment={imageSegment({ contentKind: "document", sourcePath: "guide.md" })}
          viewerId="markdown"
        />
      </ContentEditorTestProviders>,
    );

    expect(
      screen.queryByRole("heading", { name: /(?:Source \(en\)|Original · en)/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Compare original/i })).toBeInTheDocument();
  });

  it("toggles the source pane visibility", async () => {
    const user = userEvent.setup();

    render(
      <ContentEditorTestProviders>
        <ContentEditorFileViewPanel segment={imageSegment()} viewerId="image" filename="hero.png" />
      </ContentEditorTestProviders>,
    );

    expect(
      screen.getByRole("heading", { name: /(?:Source \(en\)|Original · en)/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Close comparison/i }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: /(?:Source \(en\)|Original · en)/i }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Compare original/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByRole("button", { name: /Compare original/i }));
    expect(
      screen.getByRole("heading", { name: /(?:Source \(en\)|Original · en)/i }),
    ).toBeInTheDocument();
  });
});
