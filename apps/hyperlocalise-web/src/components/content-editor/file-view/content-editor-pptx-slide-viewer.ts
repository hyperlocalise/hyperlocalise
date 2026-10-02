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
import type { PptxPresentation, PptxScrollViewer, PptxSelectionContext } from "@silurus/ooxml/pptx";

export type ContentEditorPptxSlideViewerHandle = {
  dispose: () => void;
};

/** An object on a slide, as the slide's file identifies it. */
export type PptxSlideElementRef = {
  /** The slide part the object is on, when it is one of the listed slides. */
  partName: string | null;
  shapeId: string | null;
  /** Position among the slide's top-level objects, from 0. */
  elementIndex: number;
};

export type ContentEditorPptxSlidePreviewHandle = {
  /** Redraws the slides from a changed copy of the deck, keeping the scroll position. */
  reload: (content: Uint8Array) => Promise<void>;
  /** Scrolls to a slide by its part name. */
  showSlide: (partName: string) => void;
  dispose: () => void;
};

/**
 * Draws a deck as a scrolling column of its slides, each fitted to the container's width.
 * Text can be selected and copied; nothing can be changed. The container needs a bounded
 * height.
 */
export async function mountPptxSlideViewer(
  container: HTMLElement,
  content: Uint8Array,
  options: { signal?: AbortSignal } = {},
): Promise<ContentEditorPptxSlideViewerHandle> {
  const { PptxScrollViewer } = await import("@silurus/ooxml/pptx");
  options.signal?.throwIfAborted();

  const viewer = new PptxScrollViewer(container, {
    enableTextSelection: true,
    background: "transparent",
  });
  try {
    // The viewer parses in a worker, so it is given its own copy of the file.
    await viewer.load(content.slice().buffer);
    options.signal?.throwIfAborted();
  } catch (error) {
    viewer.destroy();
    throw error;
  }

  return {
    dispose: () => {
      viewer.destroy();
    },
  };
}

type PreviewLayer = {
  element: HTMLElement;
  presentation: PptxPresentation;
  viewer: Omit<PptxScrollViewer, "load">;
  /** Part name of each slide, by the viewer's slide index. */
  partNames: Map<number, string>;
};

function destroyLayer(layer: PreviewLayer) {
  layer.viewer.destroy();
  layer.presentation.destroy();
  layer.element.remove();
}

/** The element inside a layer that the viewer scrolls. */
function scrollHost(layer: PreviewLayer): HTMLElement | null {
  for (const element of layer.element.querySelectorAll<HTMLElement>("*")) {
    if (element.scrollHeight > element.clientHeight && element.clientHeight > 0) {
      return element;
    }
  }
  return null;
}

/**
 * Draws a deck like `mountPptxSlideViewer` and can redraw it from an edited copy. Clicking an
 * object on a slide outlines it and reports which object it is. The container must be
 * positioned and have a bounded height.
 */
export async function mountPptxSlidePreview(
  container: HTMLElement,
  content: Uint8Array,
  options: {
    /** Slide part names in presentation order, to report clicks and find slides by. */
    slidePartNames: readonly string[];
    onElementSelect?: (element: PptxSlideElementRef) => void;
    signal?: AbortSignal;
  },
): Promise<ContentEditorPptxSlidePreviewHandle> {
  const { PptxPresentation, PptxScrollViewer } = await import("@silurus/ooxml/pptx");
  options.signal?.throwIfAborted();

  let disposed = false;
  let current: PreviewLayer | null = null;
  let queued: Uint8Array | null = null;
  let reloading: Promise<void> | null = null;

  async function openLayer(deck: Uint8Array): Promise<PreviewLayer> {
    const element = document.createElement("div");
    element.className = "absolute inset-0";
    container.append(element);
    let presentation: PptxPresentation | null = null;
    try {
      // The viewer parses in a worker, so it is given its own copy of the file.
      presentation = await PptxPresentation.load(deck.slice().buffer);
      const partNames = new Map<number, string>();
      options.slidePartNames.forEach((partName, order) => {
        partNames.set(presentation?.getSlideIndexByPartName(partName) ?? order, partName);
      });
      const viewer = PptxScrollViewer.fromPresentation(element, presentation, {
        enableElementSelection: true,
        background: "transparent",
        onSelectionContextChange: (context: PptxSelectionContext | null) => {
          if (context?.kind === "element") {
            options.onElementSelect?.({
              partName: partNames.get(context.slideIndex) ?? null,
              shapeId: context.shapeId ?? null,
              elementIndex: context.elementIndex,
            });
          }
        },
      });
      return { element, presentation, viewer, partNames };
    } catch (error) {
      presentation?.destroy();
      element.remove();
      throw error;
    }
  }

  async function swapTo(deck: Uint8Array) {
    const next = await openLayer(deck);
    if (disposed) {
      destroyLayer(next);
      return;
    }
    if (current) {
      // The new slides are laid out under the old ones, then take over at the same position.
      const previousHost = scrollHost(current);
      next.viewer.scrollToSlide(current.viewer.topVisibleSlide, { behavior: "auto" });
      const nextHost = scrollHost(next);
      if (previousHost && nextHost) {
        nextHost.scrollTop = previousHost.scrollTop;
      }
      destroyLayer(current);
    }
    current = next;
  }

  await swapTo(content);
  if (options.signal?.aborted) {
    disposed = true;
    if (current) {
      destroyLayer(current);
    }
    options.signal.throwIfAborted();
  }

  return {
    reload: (deck) => {
      queued = deck;
      // Edits can arrive faster than a deck redraws; only the latest copy is drawn next.
      reloading ??= (async () => {
        try {
          while (queued && !disposed) {
            const latest = queued;
            queued = null;
            await swapTo(latest);
          }
        } finally {
          reloading = null;
        }
      })();
      return reloading;
    },
    showSlide: (partName) => {
      if (!current) {
        return;
      }
      for (const [slideIndex, name] of current.partNames) {
        if (name === partName) {
          current.viewer.scrollToSlide(slideIndex, { behavior: "auto" });
          return;
        }
      }
    },
    dispose: () => {
      disposed = true;
      queued = null;
      if (current) {
        destroyLayer(current);
        current = null;
      }
    },
  };
}
