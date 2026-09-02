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

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";

import { ContentEditorFileViewPanel } from "./content-editor-file-view-panel";

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
  it("renders source pane before translated pane", () => {
    render(
      <ContentEditorTestProviders>
        <ContentEditorFileViewPanel segment={imageSegment()} viewerId="image" filename="hero.png" />
      </ContentEditorTestProviders>,
    );

    expect(screen.getByRole("heading", { name: /Translated \(de\)/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Source \(en\)/i })).toBeInTheDocument();
    expect(screen.getByAltText("Translated image")).toHaveAttribute(
      "src",
      "https://example.com/target.png",
    );
    expect(screen.getByAltText("Source image")).toHaveAttribute(
      "src",
      "https://example.com/source.png",
    );

    const sourceHeading = screen.getByRole("heading", { name: /Source \(en\)/i });
    const translatedHeading = screen.getByRole("heading", { name: /Translated \(de\)/i });
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
});
