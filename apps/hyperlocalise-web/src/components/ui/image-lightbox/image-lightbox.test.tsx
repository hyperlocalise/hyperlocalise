// @vitest-environment happy-dom

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";

import { renderWithCatProviders } from "@/components/cat/shared/cat-test-utils";
import { ImageLightbox } from "@/components/ui/image-lightbox/image-lightbox";

describe("ImageLightbox", () => {
  it("opens the lightbox and exposes zoom controls", async () => {
    const user = userEvent.setup();

    renderWithCatProviders(
      <ImageLightbox
        alt="Screenshot context"
        imageUrl="https://example.com/screenshot.png"
        markers={[{ left: 10, top: 20, width: 30, height: 15 }]}
        title="Home screen"
        trigger={<img src="https://example.com/screenshot.png" alt="Screenshot context" />}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open screenshot preview" }));

    expect(screen.getByText("Home screen")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset zoom" })).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
  });
});
