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
import { createProjectFileRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files.fixture";
import {
  createCatDocumentFileWorkspaceState,
  createCatDocumentMdxFileWorkspaceState,
  createCatImageFileWorkspaceState,
  createCatOfficeDocxFileWorkspaceState,
  createCatOfficeFileWorkspaceState,
  createCatOfficeXlsxFileWorkspaceState,
  createCatVideoFileWorkspaceState,
} from "@/components/content-editor/file-view/content-editor-file-view.fixture";
import {
  contentEditorIntelligenceFixture,
  createContentEditorWorkspaceState,
} from "@/components/content-editor/shared/content-editor.fixture";
import type { ContentEditorWorkspaceState } from "@/components/content-editor/shared/types";
import type { ContentEditorWorkspaceViewMode } from "@/components/content-editor/workspace/content-editor-workspace-view-mode";

export type ContentEditorPageShellWorkspaceEntry = {
  state: ContentEditorWorkspaceState;
  initialViewMode: ContentEditorWorkspaceViewMode;
};

export const contentEditorPageShellProductJsonPath = "product/messages.json";
export const contentEditorPageShellGuideMdxPath = "content/guide.mdx";
export const contentEditorPageShellDocxPath = "docs/product-brief.docx";
export const contentEditorPageShellXlsxPath = "sheets/localization-metrics.xlsx";

const contentEditorPageShellStringFileEntries = [
  { sourcePath: contentEditorPageShellProductJsonPath, filename: "messages.json" },
  { sourcePath: "locales/messages.po", filename: "messages.po" },
  { sourcePath: "locales/ui.yaml", filename: "ui.yaml" },
  { sourcePath: "locales/app.arb", filename: "app.arb" },
  { sourcePath: "locales/copy.xlf", filename: "copy.xlf" },
  { sourcePath: "config/messages.jsonc", filename: "messages.jsonc" },
  { sourcePath: "content/page.html", filename: "page.html" },
  { sourcePath: "ios/Localizable.strings", filename: "Localizable.strings" },
  { sourcePath: "ios/Localizable.stringsdict", filename: "Localizable.stringsdict" },
  { sourcePath: "ios/Localizable.xcstrings", filename: "Localizable.xcstrings" },
  { sourcePath: "data/export.csv", filename: "export.csv" },
  { sourcePath: "subtitles/intro.srt", filename: "intro.srt" },
  { sourcePath: "subtitles/intro.vtt", filename: "intro.vtt" },
] as const;

function createProjectFileRecordForPath(sourcePath: string, filename: string) {
  const slug = sourcePath.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
  return createProjectFileRecord({
    sourcePath,
    sourceHash: `sha256:${slug}-source`,
    filename,
    byteSize: 3_072,
    latestJob: sourcePath === contentEditorPageShellProductJsonPath ? undefined : null,
  });
}

/** Mixed project files for the CAT editor shell story file tree. */
export const contentEditorPageShellFilesFixture = [
  ...contentEditorPageShellStringFileEntries.map(({ sourcePath, filename }) =>
    createProjectFileRecordForPath(sourcePath, filename),
  ),
  createProjectFileRecord({
    sourcePath: "marketing/hero.png",
    sourceHash: "sha256:hero-source",
    filename: "hero.png",
    byteSize: 245_760,
    latestJob: null,
  }),
  createProjectFileRecord({
    sourcePath: "marketing/badge.jpeg",
    sourceHash: "sha256:badge-source",
    filename: "badge.jpeg",
    byteSize: 128_000,
    latestJob: null,
  }),
  createProjectFileRecord({
    sourcePath: "marketing/logo.webp",
    sourceHash: "sha256:logo-source",
    filename: "logo.webp",
    byteSize: 96_000,
    latestJob: null,
  }),
  createProjectFileRecord({
    sourcePath: "content/intro.md",
    sourceHash: "sha256:intro-source",
    filename: "intro.md",
    byteSize: 4_892,
    latestJob: null,
  }),
  createProjectFileRecord({
    sourcePath: contentEditorPageShellGuideMdxPath,
    sourceHash: "sha256:guide-source",
    filename: "guide.mdx",
    byteSize: 5_120,
    latestJob: null,
  }),
  createProjectFileRecord({
    sourcePath: contentEditorPageShellDocxPath,
    sourceHash: "sha256:brief-source",
    filename: "product-brief.docx",
    byteSize: 98_304,
    latestJob: null,
  }),
  createProjectFileRecord({
    sourcePath: contentEditorPageShellXlsxPath,
    sourceHash: "sha256:metrics-source",
    filename: "localization-metrics.xlsx",
    byteSize: 65_536,
    latestJob: null,
  }),
  createProjectFileRecord({
    sourcePath: "decks/quarterly-review.pptx",
    sourceHash: "sha256:deck-source",
    filename: "quarterly-review.pptx",
    byteSize: 1_048_576,
    latestJob: null,
  }),
  createProjectFileRecord({
    sourcePath: "onboarding/walkthrough.mp4",
    sourceHash: "sha256:walkthrough-source",
    filename: "walkthrough.mp4",
    byteSize: 8_388_608,
    latestJob: null,
  }),
];

export const contentEditorPageShellInitialSourcePath = contentEditorPageShellProductJsonPath;

function createPageShellStringWorkspaceState(
  sourcePath: string,
  filename: string,
): ContentEditorWorkspaceState {
  return createContentEditorWorkspaceState({
    segmentIntelligence: {
      "seg-02": {
        ...contentEditorIntelligenceFixture,
        agentContext:
          "Cached repository context: this card is rendered in the dashboard overview after a project sync.",
      },
    },
    fileContext: {
      ...createContentEditorWorkspaceState().fileContext,
      sourcePath,
      filename,
    },
  });
}

export function createContentEditorPageShellWorkspaceBySourcePath(): Record<
  string,
  ContentEditorPageShellWorkspaceEntry
> {
  const stringWorkspaces = Object.fromEntries(
    contentEditorPageShellStringFileEntries.map(({ sourcePath, filename }) => [
      sourcePath,
      {
        state: createPageShellStringWorkspaceState(sourcePath, filename),
        initialViewMode: "side-by-side" as const,
      },
    ]),
  );

  return {
    ...stringWorkspaces,
    "marketing/hero.png": {
      state: createCatImageFileWorkspaceState(),
      initialViewMode: "file",
    },
    "marketing/badge.jpeg": {
      state: createCatImageFileWorkspaceState({
        key: "marketing/badge.jpeg",
        sourceText: "marketing/badge.jpeg",
        sourcePath: "marketing/badge.jpeg",
      }),
      initialViewMode: "file",
    },
    "marketing/logo.webp": {
      state: createCatImageFileWorkspaceState({
        key: "marketing/logo.webp",
        sourceText: "marketing/logo.webp",
        sourcePath: "marketing/logo.webp",
      }),
      initialViewMode: "file",
    },
    "content/intro.md": {
      state: createCatDocumentFileWorkspaceState(),
      initialViewMode: "file",
    },
    [contentEditorPageShellGuideMdxPath]: {
      state: createCatDocumentMdxFileWorkspaceState(),
      initialViewMode: "file",
    },
    [contentEditorPageShellDocxPath]: {
      state: createCatOfficeDocxFileWorkspaceState(),
      initialViewMode: "file",
    },
    [contentEditorPageShellXlsxPath]: {
      state: createCatOfficeXlsxFileWorkspaceState(),
      initialViewMode: "file",
    },
    "decks/quarterly-review.pptx": {
      state: createCatOfficeFileWorkspaceState(),
      initialViewMode: "file",
    },
    "onboarding/walkthrough.mp4": {
      state: createCatVideoFileWorkspaceState(),
      initialViewMode: "file",
    },
  };
}

export const contentEditorPageShellTreeSamplePaths = [
  ...contentEditorPageShellStringFileEntries.map(({ sourcePath }) => sourcePath),
  "marketing/hero.png",
  "marketing/badge.jpeg",
  "marketing/logo.webp",
  "content/intro.md",
  contentEditorPageShellGuideMdxPath,
  contentEditorPageShellDocxPath,
  contentEditorPageShellXlsxPath,
  "decks/quarterly-review.pptx",
  "onboarding/walkthrough.mp4",
] as const;
