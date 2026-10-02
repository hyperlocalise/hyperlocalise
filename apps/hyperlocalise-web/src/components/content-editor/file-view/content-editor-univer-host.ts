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
import type { IDocumentData, IWorkbookData } from "@univerjs/core";
import type { ISlideData } from "@univerjs/slides";

import type {
  ContentEditorOfficeKind,
  ContentEditorOfficeSnapshot,
  ContentEditorPptxBase,
} from "@/components/content-editor/file-view/content-editor-office-convert";
import { mountPptxTextForm } from "@/components/content-editor/file-view/content-editor-pptx-text-form";
import { blockSlideEditing } from "@/components/content-editor/file-view/content-editor-slides-read-only";

export type ContentEditorUniverHostHandle = {
  getSnapshot: () => ContentEditorOfficeSnapshot;
  dispose: () => void;
};

type ContentEditorPptxSnapshot = Extract<ContentEditorOfficeSnapshot, { kind: "pptx" }>;

type UniverApi = {
  createDocument: (data?: Partial<IDocumentData>) => unknown;
  createWorkbook: (data?: Partial<IWorkbookData>) => unknown;
  createUnit?: (type: number, data: unknown) => unknown;
  getActiveDocument?: () => { save: () => IDocumentData } | null;
  getActiveWorkbook?: () => { save: () => IWorkbookData } | null;
  dispose: () => void;
};

async function createDocsHost(
  container: HTMLElement,
  data: IDocumentData,
  readOnly: boolean,
  signal?: AbortSignal,
): Promise<ContentEditorUniverHostHandle> {
  const { UniverDocsCorePreset } = await import("@univerjs/preset-docs-core");
  const UniverPresetDocsCoreEnUS = (await import("@univerjs/preset-docs-core/locales/en-US"))
    .default;
  const { createUniver, LocaleType, mergeLocales } = await import("@univerjs/presets");
  await import("@univerjs/preset-docs-core/lib/index.css");
  signal?.throwIfAborted();

  const { univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(UniverPresetDocsCoreEnUS),
    },
    presets: [
      UniverDocsCorePreset({
        container,
        toolbar: !readOnly,
      }),
    ],
  }) as { univerAPI: UniverApi };

  univerAPI.createDocument(data);

  return {
    getSnapshot: () => {
      const active = univerAPI.getActiveDocument?.();
      const snapshot = active?.save?.() ?? data;
      return { kind: "docx", data: snapshot };
    },
    dispose: () => {
      univerAPI.dispose();
    },
  };
}

async function createSheetsHost(
  container: HTMLElement,
  data: IWorkbookData,
  readOnly: boolean,
  signal?: AbortSignal,
): Promise<ContentEditorUniverHostHandle> {
  const { UniverSheetsCorePreset } = await import("@univerjs/preset-sheets-core");
  const UniverPresetSheetsCoreEnUS = (await import("@univerjs/preset-sheets-core/locales/en-US"))
    .default;
  const { createUniver, LocaleType, mergeLocales } = await import("@univerjs/presets");
  await import("@univerjs/preset-sheets-core/lib/index.css");
  signal?.throwIfAborted();

  const { univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS),
    },
    presets: [
      UniverSheetsCorePreset({
        container,
        toolbar: !readOnly,
        formulaBar: !readOnly,
      }),
    ],
  }) as { univerAPI: UniverApi };

  univerAPI.createWorkbook(data);

  return {
    getSnapshot: () => {
      const active = univerAPI.getActiveWorkbook?.();
      const snapshot = active?.save?.() ?? data;
      return { kind: "xlsx", data: snapshot };
    },
    dispose: () => {
      univerAPI.dispose();
    },
  };
}

/**
 * Univer slides 1.0.2 ships without its in-place text editor mounted, so text cannot be typed
 * on the slide canvas. An editable deck is shown as one field per paragraph instead, and the
 * edits travel with the snapshot to be written back into the file it was read from.
 */
function createPptxTextHost(
  container: HTMLElement,
  snapshot: ContentEditorPptxSnapshot,
  base: ContentEditorPptxBase,
): ContentEditorUniverHostHandle {
  const form = mountPptxTextForm(container, base.slides);
  return {
    getSnapshot: () => ({ ...snapshot, edits: form.getEdits() }),
    dispose: form.dispose,
  };
}

async function createSlidesHost(
  container: HTMLElement,
  data: ISlideData,
  readOnly: boolean,
  signal?: AbortSignal,
): Promise<ContentEditorUniverHostHandle> {
  const { LocaleType, Univer, UniverInstanceType, mergeLocales } = await import("@univerjs/core");
  const { UniverRenderEnginePlugin } = await import("@univerjs/engine-render");
  const { UniverFormulaEnginePlugin } = await import("@univerjs/engine-formula");
  const { UniverUIPlugin } = await import("@univerjs/ui");
  const { UniverDocsPlugin } = await import("@univerjs/docs");
  const { UniverDocsUIPlugin } = await import("@univerjs/docs-ui");
  const { UniverDrawingPlugin } = await import("@univerjs/drawing");
  const { UniverSlidesPlugin } = await import("@univerjs/slides");
  const { UniverSlidesUIPlugin } = await import("@univerjs/slides-ui");
  const DesignEnUS = (await import("@univerjs/design/locale/en-US")).default;
  const UIEnUS = (await import("@univerjs/ui/locale/en-US")).default;
  const DocsUIEnUS = (await import("@univerjs/docs-ui/locale/en-US")).default;
  const SlidesUIEnUS = (await import("@univerjs/slides-ui/locale/en-US")).default;

  await import("@univerjs/design/lib/index.css");
  await import("@univerjs/ui/lib/index.css");
  await import("@univerjs/docs-ui/lib/index.css");
  await import("@univerjs/slides-ui/lib/index.css");
  signal?.throwIfAborted();

  const univer = new Univer({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(DesignEnUS, UIEnUS, DocsUIEnUS, SlidesUIEnUS),
    },
  });

  univer.registerPlugin(UniverRenderEnginePlugin);
  univer.registerPlugin(UniverFormulaEnginePlugin);
  univer.registerPlugin(UniverUIPlugin, {
    container,
    toolbar: !readOnly,
  });
  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);
  univer.registerPlugin(UniverDrawingPlugin);
  univer.registerPlugin(UniverSlidesPlugin);
  univer.registerPlugin(UniverSlidesUIPlugin);

  const unit = univer.createUnit(UniverInstanceType.UNIVER_SLIDE, data) as {
    getSnapshot: () => ISlideData;
  };
  const allowSlideEditing = readOnly ? blockSlideEditing(container) : null;

  return {
    getSnapshot: () => ({ kind: "pptx", data: unit.getSnapshot() }),
    dispose: () => {
      allowSlideEditing?.();
      univer.dispose();
    },
  };
}

function createHost(
  mountNode: HTMLElement,
  snapshot: ContentEditorOfficeSnapshot,
  readOnly: boolean,
  signal?: AbortSignal,
): Promise<ContentEditorUniverHostHandle> {
  switch (snapshot.kind) {
    case "docx":
      return createDocsHost(mountNode, snapshot.data, readOnly, signal);
    case "xlsx":
      return createSheetsHost(mountNode, snapshot.data, readOnly, signal);
    case "pptx":
      return !readOnly && snapshot.base
        ? Promise.resolve(createPptxTextHost(mountNode, snapshot, snapshot.base))
        : createSlidesHost(mountNode, snapshot.data, readOnly, signal);
  }
}

export async function mountCatUniverHost(input: {
  container: HTMLElement;
  snapshot: ContentEditorOfficeSnapshot;
  readOnly: boolean;
  signal?: AbortSignal;
}): Promise<ContentEditorUniverHostHandle> {
  // Univer renders its own React root into the element it is given and may finish unmounting
  // after dispose() returns. Each editor gets its own element, removed as a whole, so nothing
  // clears DOM out from under a root that is still unmounting.
  const mountNode = document.createElement("div");
  mountNode.className = "h-full w-full";
  input.container.append(mountNode);

  try {
    const host = await createHost(mountNode, input.snapshot, input.readOnly, input.signal);
    return {
      getSnapshot: host.getSnapshot,
      dispose: () => {
        host.dispose();
        mountNode.remove();
      },
    };
  } catch (error) {
    mountNode.remove();
    throw error;
  }
}

export function isCatOfficeKind(value: string): value is ContentEditorOfficeKind {
  return value === "docx" || value === "xlsx" || value === "pptx";
}
