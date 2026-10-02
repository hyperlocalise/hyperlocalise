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

/** Presses that start selecting, moving, deleting, or editing an object on the slide canvas. */
const SLIDE_CANVAS_EDIT_EVENTS = ["pointerdown", "mousedown", "dblclick", "contextmenu"] as const;
/** Univer renders the slide list in an `aside`, with the button that adds a slide in its header. */
const SLIDE_LIST_SELECTOR = "aside";
const SLIDE_LIST_HEADER_SELECTOR = "aside header";
const SLIDE_LIST_HEADER_HIDDEN_CLASS = "[&_aside_header]:hidden";

/**
 * Univer slides has no read-only mode or permission points, and hiding the toolbar leaves
 * objects selectable. Every change to a slide starts with a press on the slide canvas or on
 * the header of the slide list, so the header is hidden and those presses are stopped before
 * Univer sees them. Wheel scrolling and switching slides keep working.
 *
 * Returns a function that allows editing again.
 */
export function blockSlideEditing(container: HTMLElement): () => void {
  const stopCanvasEdit = (event: Event) => {
    const target = event.target;
    if (target instanceof HTMLCanvasElement && !target.closest(SLIDE_LIST_SELECTOR)) {
      event.stopPropagation();
    }
  };
  const stopSlideListEdit = (event: Event) => {
    if (event.target instanceof Element && event.target.closest(SLIDE_LIST_HEADER_SELECTOR)) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

  container.classList.add(SLIDE_LIST_HEADER_HIDDEN_CLASS);
  for (const type of SLIDE_CANVAS_EDIT_EVENTS) {
    container.addEventListener(type, stopCanvasEdit, { capture: true });
  }
  container.addEventListener("click", stopSlideListEdit, { capture: true });

  return () => {
    container.classList.remove(SLIDE_LIST_HEADER_HIDDEN_CLASS);
    for (const type of SLIDE_CANVAS_EDIT_EVENTS) {
      container.removeEventListener(type, stopCanvasEdit, { capture: true });
    }
    container.removeEventListener("click", stopSlideListEdit, { capture: true });
  };
}
