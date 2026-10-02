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

import { mountPptxSlidePreview, mountPptxSlideViewer } from "./content-editor-pptx-slide-viewer";

type SelectionContext = {
  kind: string;
  slideIndex: number;
  shapeId?: string;
  elementIndex: number;
};
type PreviewOptions = { onSelectionContextChange: (context: SelectionContext | null) => void };
type FakePresentation = {
  getSlideIndexByPartName: (partName: string) => number | undefined;
  destroy: () => void;
};
type FakePreviewViewer = {
  element: HTMLElement;
  options: PreviewOptions;
  topVisibleSlide: number;
  scrollToSlide: (index: number) => void;
  destroy: () => void;
};

const viewer = vi.hoisted(() => ({
  construct: vi.fn<(container: HTMLElement, options: object) => void>(),
  load: vi.fn<(source: ArrayBuffer) => Promise<void>>(),
  destroy: vi.fn<() => void>(),
  loadPresentation: vi.fn<(source: ArrayBuffer) => Promise<unknown>>(),
  fromPresentation:
    vi.fn<(element: HTMLElement, presentation: unknown, options: unknown) => unknown>(),
}));

// The real viewer draws on canvas with WebAssembly, which happy-dom does not provide.
vi.mock("@silurus/ooxml/pptx", () => ({
  PptxScrollViewer: class {
    static fromPresentation = viewer.fromPresentation;
    constructor(container: HTMLElement, options: object) {
      viewer.construct(container, options);
    }
    load = viewer.load;
    destroy = viewer.destroy;
  },
  PptxPresentation: { load: viewer.loadPresentation },
}));

afterEach(() => {
  for (const mock of Object.values(viewer)) {
    mock.mockReset();
  }
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

describe("mountPptxSlidePreview", () => {
  const SLIDE_PARTS = ["ppt/slides/slide2.xml", "ppt/slides/slide1.xml"];
  let presentations: FakePresentation[];
  let viewers: FakePreviewViewer[];

  function mount(container: HTMLElement, onElementSelect = vi.fn<(element: unknown) => void>()) {
    presentations = [];
    viewers = [];
    viewer.loadPresentation.mockImplementation(async () => {
      const presentation: FakePresentation = {
        // The viewer numbers slides in presentation order, whatever their part names.
        getSlideIndexByPartName: (partName) => SLIDE_PARTS.indexOf(partName),
        destroy: vi.fn<() => void>(),
      };
      presentations.push(presentation);
      return presentation;
    });
    viewer.fromPresentation.mockImplementation((element, _presentation, options) => {
      const created: FakePreviewViewer = {
        element,
        options: options as PreviewOptions,
        topVisibleSlide: 0,
        scrollToSlide: vi.fn<(index: number) => void>(),
        destroy: vi.fn<() => void>(),
      };
      viewers.push(created);
      return created;
    });
    return mountPptxSlidePreview(container, new Uint8Array([80, 75]), {
      slidePartNames: SLIDE_PARTS,
      onElementSelect,
    });
  }

  it("reports a selected object with the part name of its slide", async () => {
    const onElementSelect = vi.fn<(element: unknown) => void>();
    await mount(document.createElement("div"), onElementSelect);

    viewers[0]!.options.onSelectionContextChange({
      kind: "element",
      slideIndex: 1,
      shapeId: "5",
      elementIndex: 2,
    });
    viewers[0]!.options.onSelectionContextChange({
      kind: "element",
      slideIndex: 0,
      elementIndex: 4,
    });
    viewers[0]!.options.onSelectionContextChange(null);

    expect(onElementSelect.mock.calls).toEqual([
      [{ partName: "ppt/slides/slide1.xml", shapeId: "5", elementIndex: 2 }],
      [{ partName: "ppt/slides/slide2.xml", shapeId: null, elementIndex: 4 }],
    ]);
  });

  it("scrolls to a slide by its part name", async () => {
    const preview = await mount(document.createElement("div"));

    preview.showSlide("ppt/slides/slide1.xml");

    expect(viewers[0]!.scrollToSlide).toHaveBeenCalledWith(1, { behavior: "auto" });
  });

  it("redraws from an edited deck at the same slide and drops the old drawing", async () => {
    const container = document.createElement("div");
    const preview = await mount(container);
    viewers[0]!.topVisibleSlide = 1;

    await preview.reload(new Uint8Array([1, 2, 3]));

    expect(viewers).toHaveLength(2);
    expect([...new Uint8Array(viewer.loadPresentation.mock.calls[1]![0])]).toEqual([1, 2, 3]);
    expect(viewers[1]!.scrollToSlide).toHaveBeenCalledWith(1, { behavior: "auto" });
    expect(viewers[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(presentations[0]!.destroy).toHaveBeenCalledTimes(1);
    expect([...container.children]).toEqual([viewers[1]!.element]);
  });

  it("draws only the latest deck when edits arrive during a redraw", async () => {
    const preview = await mount(document.createElement("div"));

    const first = preview.reload(new Uint8Array([1]));
    void preview.reload(new Uint8Array([2]));
    void preview.reload(new Uint8Array([3]));
    await first;

    const drawn = viewer.loadPresentation.mock.calls.map(([deck]) => [...new Uint8Array(deck)]);
    expect(drawn).toEqual([[80, 75], [1], [3]]);
  });

  it("destroys the drawing when disposed", async () => {
    const container = document.createElement("div");
    const preview = await mount(container);

    preview.dispose();

    expect(viewers[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(presentations[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(container.children).toHaveLength(0);
  });
});
