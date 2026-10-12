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

import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorVisualContextPanel } from "./content-editor-visual-context-panel";

describe("ContentEditorVisualContextPanel", () => {
  it("hides when the panel is not requested", () => {
    const { container } = renderWithContentEditorProviders(
      <ContentEditorVisualContextPanel
        showPanel={false}
        visualContext={{
          screenshots: [
            {
              id: "shot-1",
              name: "Checkout",
              imageUrl: "https://objects.test/shot.png",
              width: 800,
              height: 600,
              markers: [],
            },
          ],
        }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders bound screenshots and uploads a PNG", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);

    renderWithContentEditorProviders(
      <ContentEditorVisualContextPanel
        showPanel
        canUpload
        onUpload={onUpload}
        visualContext={{
          screenshots: [
            {
              id: "shot-1",
              name: "Checkout",
              imageUrl: "https://objects.test/shot.png",
              width: 800,
              height: 600,
              markers: [{ left: 10, top: 20, width: 30, height: 15 }],
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Checkout")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Checkout" })).toHaveAttribute(
      "src",
      "https://objects.test/shot.png",
    );

    const input = document.querySelector('input[type="file"]');
    expect(input).toBeInstanceOf(HTMLInputElement);
    const file = new File(["png"], "checkout.png", { type: "image/png" });
    await user.upload(input as HTMLInputElement, file);
    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it("rejects unsupported screenshot types", () => {
    const onUpload = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorVisualContextPanel showPanel canUpload onUpload={onUpload} />,
    );

    const input = document.querySelector('input[type="file"]');
    expect(input).toBeInstanceOf(HTMLInputElement);
    const file = new File(["gif"], "notes.gif", { type: "image/gif" });
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByText("Screenshots must be PNG, JPEG, or WebP.")).toBeInTheDocument();
  });
});
