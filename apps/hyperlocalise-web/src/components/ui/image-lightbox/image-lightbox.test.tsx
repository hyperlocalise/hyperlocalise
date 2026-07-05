// @vitest-environment happy-dom

import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";

import { renderWithCatProviders } from "@/components/cat/shared/cat-test-utils";
import { ImageLightbox } from "@/components/ui/image-lightbox/image-lightbox";

function renderLightbox() {
  renderWithCatProviders(
    <ImageLightbox
      alt="Screenshot context"
      imageUrl="https://example.com/screenshot.png"
      markers={[{ left: 10, top: 20, width: 30, height: 15 }]}
      title="Home screen"
      trigger={<img src="https://example.com/screenshot.png" alt="Screenshot context" />}
    />,
  );
}

describe("ImageLightbox", () => {
  it("opens the lightbox and exposes zoom controls", async () => {
    const user = userEvent.setup();
    renderLightbox();

    await user.click(screen.getByRole("button", { name: "Open screenshot preview" }));

    expect(screen.getByText("Home screen")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset zoom" })).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("supports pinch-to-zoom gestures on touch devices", async () => {
    const user = userEvent.setup();
    renderLightbox();

    await user.click(screen.getByRole("button", { name: "Open screenshot preview" }));

    const viewport = screen.getByTestId("image-lightbox-viewport");

    fireEvent.pointerDown(viewport, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerDown(viewport, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 260,
      clientY: 260,
    });

    expect(screen.getByText("160%")).toBeTruthy();
  });

  it("supports double-tap zoom and reset on touch devices", async () => {
    const user = userEvent.setup();
    renderLightbox();

    await user.click(screen.getByRole("button", { name: "Open screenshot preview" }));

    const viewport = screen.getByTestId("image-lightbox-viewport");

    fireEvent.pointerDown(viewport, {
      pointerId: 3,
      pointerType: "touch",
      clientX: 120,
      clientY: 120,
    });
    fireEvent.pointerUp(viewport, {
      pointerId: 3,
      pointerType: "touch",
      clientX: 120,
      clientY: 120,
    });
    fireEvent.pointerDown(viewport, {
      pointerId: 4,
      pointerType: "touch",
      clientX: 122,
      clientY: 121,
    });
    fireEvent.pointerUp(viewport, {
      pointerId: 4,
      pointerType: "touch",
      clientX: 122,
      clientY: 121,
    });

    expect(screen.getByText("200%")).toBeTruthy();

    fireEvent.pointerDown(viewport, {
      pointerId: 5,
      pointerType: "touch",
      clientX: 122,
      clientY: 121,
    });
    fireEvent.pointerUp(viewport, {
      pointerId: 5,
      pointerType: "touch",
      clientX: 122,
      clientY: 121,
    });
    fireEvent.pointerDown(viewport, {
      pointerId: 6,
      pointerType: "touch",
      clientX: 124,
      clientY: 122,
    });
    fireEvent.pointerUp(viewport, {
      pointerId: 6,
      pointerType: "touch",
      clientX: 124,
      clientY: 122,
    });

    expect(screen.getByText("100%")).toBeTruthy();
  });
});
