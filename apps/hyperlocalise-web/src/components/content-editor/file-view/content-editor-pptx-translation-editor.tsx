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
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import type { ContentEditorPptxBase } from "@/components/content-editor/file-view/content-editor-office-convert";
import {
  mountPptxSlidePreview,
  type ContentEditorPptxSlidePreviewHandle,
  type PptxSlideElementRef,
} from "@/components/content-editor/file-view/content-editor-pptx-slide-viewer";
import {
  applyPptxTextEdits,
  type PptxSlideText,
  type PptxTextUnit,
} from "@/components/content-editor/file-view/content-editor-pptx-text";
import {
  changedPptxUnits,
  PPTX_UNIT_ID_ATTRIBUTE,
  PptxTextForm,
  type ContentEditorPptxTextFormHandle,
} from "@/components/content-editor/file-view/content-editor-pptx-text-form";
import { isErr } from "@/lib/primitives/result/results";
import { cn } from "@/lib/primitives/cn";

/** How long typing must pause before the slides are redrawn with the edits. */
const PREVIEW_REDRAW_DELAY_MS = 500;

/** The first paragraph of the object a click landed on. A table is found by its position. */
function unitOfElement(
  slides: readonly PptxSlideText[],
  element: PptxSlideElementRef,
): PptxTextUnit | null {
  const units = slides.find((slide) => slide.partName === element.partName)?.units ?? [];
  return (
    (element.shapeId === null ? null : units.find((unit) => unit.shapeId === element.shapeId)) ??
    units.find((unit) => unit.elementIndex === element.elementIndex) ??
    null
  );
}

function PptxTranslationEditor({
  base,
  values,
}: {
  base: ContentEditorPptxBase;
  /** Field values by unit id, written as the user types. */
  values: Map<string, string>;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const preview = useRef<ContentEditorPptxSlidePreviewHandle | null>(null);
  const redrawTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownSlide = useRef<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    const container = previewRef.current;
    if (!container) {
      return;
    }
    const abortController = new AbortController();

    function focusElement(element: PptxSlideElementRef) {
      const unit = unitOfElement(base.slides, element);
      const fields = formRef.current?.querySelectorAll<HTMLElement>(`[${PPTX_UNIT_ID_ATTRIBUTE}]`);
      const field = [...(fields ?? [])].find(
        (candidate) => candidate.getAttribute(PPTX_UNIT_ID_ATTRIBUTE) === unit?.id,
      );
      if (!field) {
        return;
      }
      // The clicked slide is already in view, so focusing its field must not scroll to it.
      shownSlide.current = element.partName;
      field.focus();
      field.scrollIntoView({ block: "nearest" });
    }

    void mountPptxSlidePreview(container, base.content, {
      slidePartNames: base.slides.map((slide) => slide.partName),
      onElementSelect: focusElement,
      signal: abortController.signal,
    }).then(
      (handle) => {
        preview.current = handle;
      },
      () => {
        // A deck that cannot be drawn is still edited through its fields.
        if (!abortController.signal.aborted) {
          setPreviewFailed(true);
        }
      },
    );

    return () => {
      abortController.abort();
      if (redrawTimer.current) {
        clearTimeout(redrawTimer.current);
      }
      preview.current?.dispose();
      preview.current = null;
    };
  }, [base]);

  function handleChange(unitId: string, text: string) {
    values.set(unitId, text);
    if (redrawTimer.current) {
      clearTimeout(redrawTimer.current);
    }
    redrawTimer.current = setTimeout(() => {
      void applyPptxTextEdits(base.content, changedPptxUnits(base.slides, values)).then(
        (edited) => {
          if (!isErr(edited)) {
            // A redraw that fails leaves the previous slides in place.
            void preview.current?.reload(edited.value).catch(() => undefined);
          }
        },
      );
    }, PREVIEW_REDRAW_DELAY_MS);
  }

  function handleFocusSlide(partName: string) {
    if (shownSlide.current !== partName) {
      shownSlide.current = partName;
      preview.current?.showSlide(partName);
    }
  }

  return (
    <div className="@container h-full">
      <div
        className={cn(
          "grid h-full",
          !previewFailed &&
            "grid-rows-[minmax(0,2fr)_minmax(0,3fr)] @2xl:grid-cols-2 @2xl:grid-rows-1",
        )}
      >
        {previewFailed ? null : (
          <div
            ref={previewRef}
            className="relative min-h-0 border-b border-border @2xl:border-r @2xl:border-b-0"
          />
        )}
        <div ref={formRef} className="min-h-0">
          <PptxTextForm
            slides={base.slides}
            readOnly={false}
            onChange={handleChange}
            onFocusSlide={handleFocusSlide}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The editable view of a deck: its slides drawn from the file with the edits so far, beside
 * one field per paragraph. Typing redraws the slides, focusing a field shows its slide, and
 * clicking an object on a slide focuses its first field.
 */
export function mountPptxTranslationEditor(
  container: HTMLElement,
  base: ContentEditorPptxBase,
): ContentEditorPptxTextFormHandle {
  const values = new Map<string, string>();
  const root = createRoot(container);
  root.render(<PptxTranslationEditor base={base} values={values} />);

  return {
    getEdits: () => changedPptxUnits(base.slides, values),
    // The pane disposes editors while React commits, when a root cannot unmount synchronously.
    dispose: () => queueMicrotask(() => root.unmount()),
  };
}
