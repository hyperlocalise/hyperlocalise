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

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { mountPptxSlideViewer } from "./content-editor-pptx-slide-viewer";

const viewer = vi.hoisted(() => ({
  construct: vi.fn<(container: HTMLElement, options: object) => void>(),
  load: vi.fn<(source: ArrayBuffer) => Promise<void>>(),
  destroy: vi.fn<() => void>(),
}));

// The real viewer draws on canvas with WebAssembly, which happy-dom does not provide.
vi.mock("@silurus/ooxml/pptx", () => ({
  PptxScrollViewer: class {
    constructor(container: HTMLElement, options: object) {
      viewer.construct(container, options);
    }
    load = viewer.load;
    destroy = viewer.destroy;
  },
}));

afterEach(() => {
  viewer.construct.mockReset();
  viewer.load.mockReset();
  viewer.destroy.mockReset();
});

describe("mountPptxSlideViewer", () => {
  it("loads a copy of the deck into a viewer with selectable text", async () => {
    viewer.load.mockResolvedValue();
    const container = document.createElement("div");
    const content = new Uint8Array([80, 75, 3, 4]);

    const handle = await mountPptxSlideViewer(container, content);

    expect(viewer.construct).toHaveBeenCalledWith(
      container,
      expect.objectContaining({ enableTextSelection: true }),
    );
    const loaded = viewer.load.mock.calls[0]![0];
    expect([...new Uint8Array(loaded)]).toEqual([80, 75, 3, 4]);
    expect(loaded).not.toBe(content.buffer);
    expect(viewer.destroy).not.toHaveBeenCalled();

    handle.dispose();
    expect(viewer.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys the viewer when the deck cannot be loaded", async () => {
    viewer.load.mockRejectedValue(new Error("not a deck"));

    await expect(
      mountPptxSlideViewer(document.createElement("div"), new Uint8Array([1])),
    ).rejects.toThrow("not a deck");
    expect(viewer.destroy).toHaveBeenCalledTimes(1);
  });

  it("does not create a viewer once the signal has aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      mountPptxSlideViewer(document.createElement("div"), new Uint8Array([1]), {
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(viewer.construct).not.toHaveBeenCalled();
  });
});
