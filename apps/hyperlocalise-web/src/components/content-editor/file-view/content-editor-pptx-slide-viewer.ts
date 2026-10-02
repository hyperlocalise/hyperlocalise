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

export type ContentEditorPptxSlideViewerHandle = {
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
