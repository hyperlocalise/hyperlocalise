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
import { createRoot } from "react-dom/client";

import type { PptxSlideText } from "@/components/content-editor/file-view/content-editor-pptx-text";
import { Textarea } from "@/components/ui/textarea";

export type ContentEditorPptxTextFormHandle = {
  /** Text that differs from the file, by unit id. */
  getEdits: () => Record<string, string>;
  dispose: () => void;
};

function PptxTextForm({
  slides,
  onChange,
}: {
  slides: readonly PptxSlideText[];
  onChange: (unitId: string, text: string) => void;
}) {
  return (
    <ol className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      {slides.map((slide, index) => (
        <li key={slide.partName} className="flex gap-3">
          <span className="w-6 shrink-0 pt-2 text-right text-xs font-medium text-muted-foreground tabular-nums">
            {index + 1}
          </span>
          <div className="flex min-h-9 min-w-0 flex-1 flex-col gap-2 border-l border-border pl-3">
            {slide.units.map((unit) => (
              // The text as stored in the file names the field and shows again once it is cleared.
              <Textarea
                key={unit.id}
                aria-label={unit.text}
                placeholder={unit.text}
                defaultValue={unit.text}
                className="min-h-9 rounded-md py-2"
                onChange={(event) => onChange(unit.id, event.target.value)}
              />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Shows a deck as one numbered group per slide with a field per paragraph, so every edit maps
 * to exactly one paragraph of the file. A line break in a field is a line break in the
 * paragraph.
 */
export function mountPptxTextForm(
  container: HTMLElement,
  slides: readonly PptxSlideText[],
): ContentEditorPptxTextFormHandle {
  const values = new Map<string, string>();
  const root = createRoot(container);
  root.render(
    <PptxTextForm slides={slides} onChange={(unitId, text) => values.set(unitId, text)} />,
  );

  return {
    getEdits: () => {
      const edits: Record<string, string> = {};
      for (const unit of slides.flatMap((slide) => slide.units)) {
        const text = values.get(unit.id);
        if (text !== undefined && text !== unit.text) {
          edits[unit.id] = text;
        }
      }
      return edits;
    },
    // The pane disposes editors while React commits, when a root cannot unmount synchronously.
    dispose: () => queueMicrotask(() => root.unmount()),
  };
}
