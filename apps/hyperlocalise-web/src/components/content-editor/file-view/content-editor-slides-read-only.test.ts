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

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { blockSlideEditing } from "./content-editor-slides-read-only";

/** The parts of the Univer slides workbench that take presses. */
function renderWorkbench() {
  const container = document.createElement("div");
  container.innerHTML = `
    <aside>
      <header><a>Append slide</a></header>
      <div data-slide="1"><canvas></canvas></div>
    </aside>
    <section><canvas data-main></canvas></section>
  `;
  document.body.append(container);
  return {
    container,
    appendSlide: container.querySelector("a")!,
    thumbnail: container.querySelector("[data-slide]")!,
    thumbnailCanvas: container.querySelector("aside canvas")!,
    slideCanvas: container.querySelector("canvas[data-main]")!,
  };
}

function press(target: Element, type: string): boolean {
  const received = vi.fn();
  target.addEventListener(type, received);
  target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  target.removeEventListener(type, received);
  return received.mock.calls.length > 0;
}

describe("blockSlideEditing", () => {
  let workbench: ReturnType<typeof renderWorkbench>;

  beforeEach(() => {
    workbench = renderWorkbench();
  });

  afterEach(() => {
    workbench.container.remove();
  });

  it("keeps presses that select, move, or edit objects away from the slide canvas", () => {
    blockSlideEditing(workbench.container);

    for (const type of ["pointerdown", "mousedown", "dblclick", "contextmenu"]) {
      expect(press(workbench.slideCanvas, type)).toBe(false);
    }
    expect(press(workbench.slideCanvas, "wheel")).toBe(true);
    expect(press(workbench.slideCanvas, "pointermove")).toBe(true);
  });

  it("blocks adding a slide and still lets the slide list switch slides", () => {
    blockSlideEditing(workbench.container);

    expect(press(workbench.appendSlide, "click")).toBe(false);
    expect(workbench.container.className).toContain("[&_aside_header]:hidden");
    expect(press(workbench.thumbnail, "click")).toBe(true);
    expect(press(workbench.thumbnailCanvas, "pointerdown")).toBe(true);
  });

  it("allows editing again once released", () => {
    const allowEditing = blockSlideEditing(workbench.container);
    allowEditing();

    expect(press(workbench.slideCanvas, "pointerdown")).toBe(true);
    expect(press(workbench.appendSlide, "click")).toBe(true);
    expect(workbench.container.className).toBe("");
  });
});
