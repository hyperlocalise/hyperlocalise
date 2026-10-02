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

import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { isErr } from "@/lib/primitives/result/results";

import type { ContentEditorPptxBase } from "./content-editor-office-convert";
import {
  mountPptxSlidePreview,
  type ContentEditorPptxSlidePreviewHandle,
} from "./content-editor-pptx-slide-viewer";
import { extractPptxSlideTexts } from "./content-editor-pptx-text";
import { buildPptxFixture } from "./content-editor-pptx-text.fixture";
import { mountPptxTranslationEditor } from "./content-editor-pptx-translation-editor";

const applyEdits = vi.hoisted(() => ({
  impl: vi.fn(),
  actual: null as null | typeof import("./content-editor-pptx-text").applyPptxTextEdits,
}));

// The slide preview draws on canvas with WebAssembly, which happy-dom does not provide.
vi.mock("./content-editor-pptx-slide-viewer", () => ({ mountPptxSlidePreview: vi.fn() }));
vi.mock("./content-editor-pptx-text", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./content-editor-pptx-text")>();
  applyEdits.actual = actual.applyPptxTextEdits;
  applyEdits.impl.mockImplementation(actual.applyPptxTextEdits);
  return {
    ...actual,
    applyPptxTextEdits: (
      content: Uint8Array | ArrayBuffer,
      edits: Readonly<Record<string, string>>,
    ) => applyEdits.impl(content, edits),
  };
});

const mountPreview = vi.mocked(mountPptxSlidePreview);
const CONTENT_SLIDE_PART = "ppt/slides/slide1.xml";
const COVER_SLIDE_PART = "ppt/slides/slide2.xml";

async function slideTexts(content: Uint8Array): Promise<string[]> {
  const slides = await extractPptxSlideTexts(content);
  if (isErr(slides)) {
    throw new Error(`extract failed: ${slides.error.code}`);
  }
  return slides.value.flatMap((slide) => slide.units.map((unit) => unit.text));
}

describe("mountPptxTranslationEditor", () => {
  let container: HTMLElement;
  let base: ContentEditorPptxBase;
  let preview: {
    [Key in keyof ContentEditorPptxSlidePreviewHandle]: ReturnType<
      typeof vi.fn<ContentEditorPptxSlidePreviewHandle[Key]>
    >;
  };

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.append(container);
    const content = new Uint8Array(await buildPptxFixture());
    const slides = await extractPptxSlideTexts(content);
    if (isErr(slides)) {
      throw new Error(`extract failed: ${slides.error.code}`);
    }
    base = { content, slides: slides.value };
    preview = {
      reload: vi.fn<ContentEditorPptxSlidePreviewHandle["reload"]>(async () => undefined),
      showSlide: vi.fn<ContentEditorPptxSlidePreviewHandle["showSlide"]>(),
      dispose: vi.fn<ContentEditorPptxSlidePreviewHandle["dispose"]>(),
    };
    mountPreview.mockResolvedValue(preview);
    applyEdits.impl.mockReset();
    applyEdits.impl.mockImplementation((content, edits) => applyEdits.actual!(content, edits));
  });

  afterEach(() => {
    mountPreview.mockReset();
    container.remove();
  });

  function mount() {
    return act(async () => mountPptxTranslationEditor(container, base));
  }

  it("draws the deck beside its fields and redraws it with what is typed", async () => {
    const user = userEvent.setup();
    const editor = await mount();

    expect(mountPreview).toHaveBeenCalledTimes(1);
    const [, content, options] = mountPreview.mock.calls[0]!;
    expect(content).toBe(base.content);
    expect(options.slidePartNames).toEqual([COVER_SLIDE_PART, CONTENT_SLIDE_PART]);

    const title = screen.getByRole("textbox", { name: "Quarterly review" });
    await user.clear(title);
    await user.type(title, "Revue trimestrielle");

    await waitFor(
      () => {
        expect(preview.reload).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
    expect(await slideTexts(preview.reload.mock.calls.at(-1)![0])).toContain("Revue trimestrielle");
    expect(editor.getEdits()).toEqual({ [`${CONTENT_SLIDE_PART}#0`]: "Revue trimestrielle" });
  });

  it("focuses the first field of the object selected on a slide", async () => {
    await mount();
    const { onElementSelect } = mountPreview.mock.calls[0]![2];

    act(() => onElementSelect?.({ partName: CONTENT_SLIDE_PART, shapeId: "3", elementIndex: 1 }));
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Revenue grew 12% this quarter & costs fell." }),
    );

    // The viewer reports a table without a shape id, so it is found by its position.
    act(() => onElementSelect?.({ partName: CONTENT_SLIDE_PART, shapeId: null, elementIndex: 4 }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Plan" }));
    // The selected slide is already in view.
    expect(preview.showSlide).not.toHaveBeenCalled();
  });

  it("shows the slide of the field that takes focus", async () => {
    const user = userEvent.setup();
    await mount();

    await user.click(screen.getByRole("textbox", { name: "Acme Corp" }));
    await user.click(screen.getByRole("textbox", { name: "Plan" }));
    await user.click(screen.getByRole("textbox", { name: "Price" }));

    expect(preview.showSlide.mock.calls).toEqual([[COVER_SLIDE_PART], [CONTENT_SLIDE_PART]]);
  });

  it("keeps the fields when the slides cannot be drawn", async () => {
    mountPreview.mockRejectedValue(new Error("unsupported deck"));
    const user = userEvent.setup();
    const editor = await mount();

    const cover = screen.getByRole("textbox", { name: "Acme Corp" });
    await user.type(cover, "!");

    expect(editor.getEdits()).toEqual({ [`${COVER_SLIDE_PART}#0`]: "Acme Corp!" });
  });

  it("disposes the preview with the editor", async () => {
    const editor = await mount();

    await act(async () => editor.dispose());

    await waitFor(() => {
      expect(preview.dispose).toHaveBeenCalledTimes(1);
    });
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("disposes a preview that finishes mounting after the editor is gone", async () => {
    let finishMount: (handle: ContentEditorPptxSlidePreviewHandle) => void = () => undefined;
    mountPreview.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishMount = resolve;
        }),
    );

    const editor = await mount();
    await act(async () => {
      editor.dispose();
    });
    await act(async () => {
      finishMount(preview);
    });

    expect(preview.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not let a slower earlier rewrite replace a later preview", async () => {
    const user = userEvent.setup();
    const pending: Array<() => Promise<void>> = [];
    applyEdits.impl.mockImplementation(
      (content: Uint8Array | ArrayBuffer, edits: Readonly<Record<string, string>>) =>
        new Promise((resolve, reject) => {
          pending.push(async () => {
            try {
              resolve(await applyEdits.actual!(content, edits));
            } catch (error) {
              reject(error);
            }
          });
        }),
    );

    await mount();
    const title = screen.getByRole("textbox", { name: "Quarterly review" });
    await user.clear(title);
    await user.type(title, "First");
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 600);
      });
    });
    expect(pending.length).toBeGreaterThan(0);
    const earlier = pending.splice(0);

    await user.clear(title);
    await user.type(title, "Second");
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 600);
      });
    });
    expect(pending.length).toBeGreaterThan(0);
    const later = pending.splice(0);

    await act(async () => {
      await Promise.all(later.map((finish) => finish()));
    });
    expect(preview.reload).toHaveBeenCalled();
    expect(await slideTexts(preview.reload.mock.calls.at(-1)![0])).toContain("Second");
    const reloads = preview.reload.mock.calls.length;

    await act(async () => {
      await Promise.all(earlier.map((finish) => finish()));
    });
    expect(preview.reload).toHaveBeenCalledTimes(reloads);
  });
});
