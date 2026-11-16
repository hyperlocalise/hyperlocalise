"use client";

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
import { useEffect, useRef, type PointerEvent } from "react";
import { autorun } from "mobx";
import { observer } from "mobx-react-lite";
import { XIcon } from "@phosphor-icons/react";
import { useIntl } from "react-intl";

import { IMAGE_EDIT_MARK_COLOR } from "@/lib/projects/files/image-edit";

import { drawImageEditStrokes, type ImageEditPoint } from "./content-editor-image-edit-canvas";
import type { ContentEditorImageEditStore, ImageEditTool } from "./content-editor-image-edit-store";
import { imageEditMessages as messages } from "./content-editor-image-edit.messages";

/** How an erased area shows while it is brushed: the mark colour, see-through. */
const ERASE_OPACITY = 0.45;

function pointIn(event: PointerEvent<HTMLElement>): ImageEditPoint {
  const box = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
    y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
  };
}

/**
 * What an edit is drawn with, over the image it is for: brush strokes for
 * Markup and Erase, numbered notes for Comment. Points are kept as shares of
 * the image so they stay put when the card resizes. Escape cancels.
 */
export const ContentEditorImageEditOverlay = observer(function ContentEditorImageEditOverlay({
  store,
  tool,
}: {
  store: ContentEditorImageEditStore;
  tool: ImageEditTool;
}) {
  const intl = useIntl();
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const surface = canvas.current;
    const box = container.current;
    const context = surface?.getContext("2d");
    if (!surface || !box || !context) return;
    let size = { width: box.clientWidth, height: box.clientHeight };
    const paint = () => {
      const ratio = window.devicePixelRatio || 1;
      surface.width = Math.round(size.width * ratio);
      surface.height = Math.round(size.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, size.width, size.height);
      context.strokeStyle = IMAGE_EDIT_MARK_COLOR;
      drawImageEditStrokes(context, store.strokes, size.width, size.height, 2);
    };
    const dispose = autorun(paint);
    const observer = new ResizeObserver(() => {
      size = { width: box.clientWidth, height: box.clientHeight };
      paint();
    });
    observer.observe(box);
    return () => {
      dispose();
      observer.disconnect();
    };
  }, [store]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") store.cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  return (
    <div
      ref={container}
      data-testid="image-edit-overlay"
      className="absolute inset-0 z-10 cursor-crosshair touch-none rounded-lg ring-2 ring-primary"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        if (tool === "comment") {
          if (event.target === event.currentTarget || event.target === canvas.current) {
            store.addPin(pointIn(event));
          }
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = true;
        store.startStroke(pointIn(event));
      }}
      onPointerMove={(event) => {
        if (drawing.current) store.extendStroke(pointIn(event));
      }}
      onPointerUp={() => {
        drawing.current = false;
      }}
      onPointerCancel={() => {
        drawing.current = false;
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <canvas
        ref={canvas}
        className="pointer-events-none absolute inset-0 size-full"
        // An erased area is one see-through layer: overlapping strokes do not darken it.
        style={tool === "erase" ? { opacity: ERASE_OPACITY } : undefined}
      />
      {tool === "comment"
        ? store.pins.map((pin, index) => (
            <div
              // Pins are only added at the end and removed by their own button.
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className="absolute"
              style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                aria-label={intl.formatMessage(messages.note, { number: index + 1 })}
                onClick={() => store.editPin(index)}
                className="absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-xs font-semibold text-white shadow"
                style={{ background: IMAGE_EDIT_MARK_COLOR }}
              >
                {index + 1}
              </button>
              {store.editingPin === index ? (
                <div className="absolute top-4 left-2 z-20 flex w-56 items-center gap-1 rounded-lg border bg-popover p-1 shadow-lg">
                  <input
                    autoFocus
                    value={pin.text}
                    onChange={(event) => store.setPinText(index, event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") store.editPin(null);
                      event.stopPropagation();
                    }}
                    placeholder={intl.formatMessage(messages.notePlaceholder)}
                    aria-label={intl.formatMessage(messages.note, { number: index + 1 })}
                    className="h-7 min-w-0 flex-1 rounded-md bg-muted px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    aria-label={intl.formatMessage(messages.removeNote)}
                    onClick={() => store.removePin(index)}
                    className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <XIcon aria-hidden />
                  </button>
                </div>
              ) : pin.text ? (
                <span className="absolute top-4 left-2 max-w-40 truncate rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow">
                  {pin.text}
                </span>
              ) : null}
            </div>
          ))
        : null}
    </div>
  );
});
