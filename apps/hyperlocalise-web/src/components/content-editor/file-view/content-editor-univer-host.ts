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
import type { IDocumentData, IWorkbookData, Univer } from "@univerjs/core";
import type { IRender } from "@univerjs/engine-render";
import type { ISlideData } from "@univerjs/slides";

import type {
  ContentEditorOfficeKind,
  ContentEditorOfficeSnapshot,
} from "@/components/content-editor/file-view/content-editor-office-convert";

export type ContentEditorUniverHostHandle = {
  getSnapshot: () => ContentEditorOfficeSnapshot;
  dispose: () => void;
};

type UniverApi = {
  createDocument: (data?: Partial<IDocumentData>) => unknown;
  createWorkbook: (data?: Partial<IWorkbookData>) => unknown;
  createUnit?: (type: number, data: unknown) => unknown;
  getActiveDocument?: () => {
    save: () => IDocumentData;
    getPermission: () => { setPoint: (action: number, value: boolean) => Promise<void> };
  } | null;
  getActiveWorkbook?: () => { save: () => IWorkbookData } | null;
  dispose: () => void;
};

/** `UnitAction.Edit` from `@univerjs/protocol`, which this app does not depend on directly. */
const UNIT_ACTION_EDIT = 1;

/**
 * Univer draws a blinking cursor wherever the page was last clicked, even when the document
 * cannot be edited. This clears the cursor as soon as it appears. A dragged selection is left
 * alone, so text can still be copied.
 */
async function hideCursor(univer: Univer, unitId: string): Promise<void> {
  const { IRenderManagerService } = await import("@univerjs/engine-render");
  const { DocSelectionRenderService } = await import("@univerjs/docs-ui");
  const renders = univer.__getInjector().get(IRenderManagerService);

  function watch(render: IRender) {
    if (render.unitId !== unitId) {
      return;
    }
    const selection = render.with(DocSelectionRenderService);
    selection.textSelectionInner$.subscribe((current) => {
      if (current?.textRanges.some((range) => range.collapsed)) {
        selection.removeAllRanges();
      }
    });
  }

  const render = renders.getRenderUnitById(unitId);
  if (render) {
    watch(render);
  } else {
    renders.created$.subscribe(watch);
  }
}

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

  const { univer, univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(UniverPresetDocsCoreEnUS),
    },
    presets: [
      UniverDocsCorePreset({
        container,
        toolbar: !readOnly,
        // One toolbar row instead of the Start and Insert tabs.
        ribbonType: "simple",
      }),
    ],
  }) as { univer: Univer; univerAPI: UniverApi };

  univerAPI.createDocument(data);
  if (readOnly) {
    // Hiding the toolbar leaves the page itself editable, so the edit permission is switched off.
    await univerAPI.getActiveDocument?.()?.getPermission().setPoint(UNIT_ACTION_EDIT, false);
    await hideCursor(univer, data.id);
  }

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

  return {
    getSnapshot: () => ({ kind: "pptx", data: unit.getSnapshot() }),
    dispose: () => {
      univer.dispose();
    },
  };
}

/**
 * Univer clips its toolbar and relies on moving tools into the overflow menu. The toolbar is
 * made scrollable so every tool, and the overflow menu itself, stays reachable if that falls short.
 */
const MOUNT_NODE_CLASS = [
  "h-full w-full",
  "[&_[data-u-comp=ribbon-toolbar]]:overflow-x-auto!",
  "[&_[data-u-comp=ribbon-toolbar]]:[scrollbar-width:thin]!",
].join(" ");

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
      return createSlidesHost(mountNode, snapshot.data, readOnly, signal);
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
  mountNode.className = MOUNT_NODE_CLASS;
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
