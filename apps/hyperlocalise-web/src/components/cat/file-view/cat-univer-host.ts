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
  CatOfficeKind,
  CatOfficeSnapshot,
} from "@/components/cat/file-view/cat-office-convert";

export type CatUniverHostHandle = {
  getSnapshot: () => CatOfficeSnapshot;
  dispose: () => void;
};

type UniverApi = {
  createUniverDoc: (data?: Partial<IDocumentData>) => unknown;
  createWorkbook: (data?: Partial<IWorkbookData>) => unknown;
  createUnit?: (type: number, data: unknown) => unknown;
  getActiveDocument?: () => { getSnapshot: () => IDocumentData } | null;
  getActiveWorkbook?: () => { save: () => IWorkbookData } | null;
  dispose: () => void;
};

async function createDocsHost(
  container: HTMLElement,
  data: IDocumentData,
  readOnly: boolean,
): Promise<CatUniverHostHandle> {
  const { UniverDocsCorePreset } = await import("@univerjs/preset-docs-core");
  const UniverPresetDocsCoreEnUS = (await import("@univerjs/preset-docs-core/locales/en-US"))
    .default;
  const { createUniver, LocaleType, mergeLocales } = await import("@univerjs/presets");
  await import("@univerjs/preset-docs-core/lib/index.css");

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

  univerAPI.createUniverDoc(data);

  return {
    getSnapshot: () => {
      const active = univerAPI.getActiveDocument?.();
      const snapshot = active?.getSnapshot?.() ?? data;
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
): Promise<CatUniverHostHandle> {
  const { UniverSheetsCorePreset } = await import("@univerjs/preset-sheets-core");
  const UniverPresetSheetsCoreEnUS = (await import("@univerjs/preset-sheets-core/locales/en-US"))
    .default;
  const { createUniver, LocaleType, mergeLocales } = await import("@univerjs/presets");
  await import("@univerjs/preset-sheets-core/lib/index.css");

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
  _readOnly: boolean,
): Promise<CatUniverHostHandle> {
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
    toolbar: false,
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

export async function mountCatUniverHost(input: {
  container: HTMLElement;
  snapshot: CatOfficeSnapshot;
  readOnly: boolean;
}): Promise<CatUniverHostHandle> {
  switch (input.snapshot.kind) {
    case "docx":
      return createDocsHost(input.container, input.snapshot.data, input.readOnly);
    case "xlsx":
      return createSheetsHost(input.container, input.snapshot.data, input.readOnly);
    case "pptx":
      return createSlidesHost(input.container, input.snapshot.data, input.readOnly);
  }
}

export function isCatOfficeKind(value: string): value is CatOfficeKind {
  return value === "docx" || value === "xlsx" || value === "pptx";
}
