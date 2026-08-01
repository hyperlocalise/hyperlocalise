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
import { describe, expect, it, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CatTestProviders } from "@/components/cat/shared/cat-test-utils";
import type { CatSegment } from "@/components/cat/shared/types";

import { CatFileViewPanel } from "./cat-file-view-panel";

function imageSegment(overrides: Partial<CatSegment> = {}): CatSegment {
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

describe("CatFileViewPanel", () => {
  it("renders translated pane before source pane", () => {
    render(
      <CatTestProviders>
        <CatFileViewPanel
          segment={imageSegment()}
          viewerId="image"
          filename="hero.png"
        />
      </CatTestProviders>,
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

    const translatedHeading = screen.getByRole("heading", { name: /Translated \(de\)/i });
    const sourceHeading = screen.getByRole("heading", { name: /Source \(en\)/i });
    expect(
      translatedHeading.compareDocumentPosition(sourceHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("uploads a translated image file", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();

    render(
      <CatTestProviders>
        <CatFileViewPanel
          segment={imageSegment({ targetAssetUrl: null })}
          viewerId="image"
          onUpload={onUpload}
        />
      </CatTestProviders>,
    );

    const file = new File(["png"], "de-hero.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    await user.upload(input as HTMLInputElement, file);

    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it("shows unsupported preview when no viewer is registered", () => {
    render(
      <CatTestProviders>
        <CatFileViewPanel segment={imageSegment()} viewerId={null} />
      </CatTestProviders>,
    );

    expect(
      screen.getAllByText("Preview is not available for this file type yet.").length,
    ).toBeGreaterThan(0);
  });
});
