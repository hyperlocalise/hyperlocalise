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
import {
  inferSupportedDocumentTranslationFileFormat,
  inferSupportedImageTranslationFileFormat,
  inferSupportedOfficeTranslationFileFormat,
  inferSupportedVideoTranslationFileFormat,
} from "@/lib/translation/file-formats";

import type { ContentEditorContentKind } from "@/components/content-editor/shared/types";
import type { ContentEditorWorkspaceViewMode } from "./content-editor-workspace-view-mode";

export type ContentEditorFileViewFamily = "image" | "video" | "text" | "office" | "document";

export type ContentEditorFileViewerId = "image" | "video" | "docx" | "xlsx" | "pptx" | "markdown";

export type ContentEditorFileViewCapabilities = {
  family: ContentEditorFileViewFamily;
  availableViews: readonly ContentEditorWorkspaceViewMode[];
  defaultView: ContentEditorWorkspaceViewMode;
  viewerId: ContentEditorFileViewerId | null;
};

const SEGMENT_VIEWS = [
  "comfortable",
  "side-by-side",
] as const satisfies readonly ContentEditorWorkspaceViewMode[];
const MULTILINGUAL_SEGMENT_VIEWS = [
  ...SEGMENT_VIEWS,
  "multilingual",
] as const satisfies readonly ContentEditorWorkspaceViewMode[];
const FILE_ONLY_VIEWS = ["file"] as const satisfies readonly ContentEditorWorkspaceViewMode[];
const DOCUMENT_AND_SEGMENT_VIEWS = [
  ...SEGMENT_VIEWS,
  "file",
] as const satisfies readonly ContentEditorWorkspaceViewMode[];
const DOCUMENT_AND_MULTILINGUAL_VIEWS = [
  ...MULTILINGUAL_SEGMENT_VIEWS,
  "file",
] as const satisfies readonly ContentEditorWorkspaceViewMode[];

function isNativeCatProvider(providerKind?: string | null): boolean {
  return providerKind == null || providerKind === "native";
}

function segmentViews(multilingualViewAvailable?: boolean) {
  return multilingualViewAvailable ? MULTILINGUAL_SEGMENT_VIEWS : SEGMENT_VIEWS;
}

function documentAndSegmentViews(multilingualViewAvailable?: boolean) {
  return multilingualViewAvailable ? DOCUMENT_AND_MULTILINGUAL_VIEWS : DOCUMENT_AND_SEGMENT_VIEWS;
}

function extensionOf(sourcePath: string): string | null {
  const basename = sourcePath.split(/[\\/]/).pop() ?? sourcePath;
  const dotIndex = basename.lastIndexOf(".");
  if (dotIndex <= 0) {
    return null;
  }
  return basename.slice(dotIndex).toLowerCase();
}

function officeViewerIdForExtension(extension: string | null): ContentEditorFileViewerId | null {
  switch (extension) {
    case ".docx":
      return "docx";
    case ".xlsx":
    case ".xls":
      return "xlsx";
    case ".pptx":
      return "pptx";
    default:
      return null;
  }
}

export function resolveCatFileViewCapabilities(input: {
  sourcePath?: string | null;
  contentKind?: ContentEditorContentKind | null;
  /** Crowdin and other TMS providers already expose markdown as string segments. */
  providerKind?: string | null;
  /** The multilingual table needs a locale/key configuration the workspace may not have. */
  multilingualViewAvailable?: boolean;
}): ContentEditorFileViewCapabilities {
  const sourcePath = input.sourcePath?.trim() ?? "";
  const contentKind = input.contentKind ?? null;
  const nativeProject = isNativeCatProvider(input.providerKind);

  if (contentKind === "image_file" || inferSupportedImageTranslationFileFormat(sourcePath)) {
    return {
      family: "image",
      availableViews: FILE_ONLY_VIEWS,
      defaultView: "file",
      viewerId: "image",
    };
  }

  if (contentKind === "video_file" || inferSupportedVideoTranslationFileFormat(sourcePath)) {
    return {
      family: "video",
      availableViews: FILE_ONLY_VIEWS,
      defaultView: "file",
      viewerId: "video",
    };
  }

  const extension = extensionOf(sourcePath);
  const officeFormat =
    contentKind === "office_file" || inferSupportedOfficeTranslationFileFormat(sourcePath);
  if (officeFormat) {
    return {
      family: "office",
      availableViews: FILE_ONLY_VIEWS,
      defaultView: "file",
      viewerId: officeViewerIdForExtension(extension) ?? "docx",
    };
  }

  if (contentKind === "document" || inferSupportedDocumentTranslationFileFormat(sourcePath)) {
    if (!nativeProject) {
      return {
        family: "text",
        availableViews: segmentViews(input.multilingualViewAvailable),
        defaultView: "side-by-side",
        viewerId: null,
      };
    }

    return {
      family: "document",
      availableViews: documentAndSegmentViews(input.multilingualViewAvailable),
      defaultView: "file",
      viewerId: "markdown",
    };
  }

  // String Content Editor files and unknown paths stay in segment views.
  return {
    family: "text",
    availableViews: segmentViews(input.multilingualViewAvailable),
    defaultView: "side-by-side",
    viewerId: null,
  };
}

export function clampCatWorkspaceViewMode(
  mode: ContentEditorWorkspaceViewMode,
  capabilities: ContentEditorFileViewCapabilities,
): ContentEditorWorkspaceViewMode {
  if (capabilities.availableViews.includes(mode)) {
    return mode;
  }
  return capabilities.defaultView;
}

export function isCatFileViewAvailable(capabilities: ContentEditorFileViewCapabilities) {
  return capabilities.availableViews.includes("file");
}

export type ContentEditorDocumentView = {
  externalStringId: string;
  sourceAssetUrl?: string | null;
  targetAssetUrl?: string | null;
  imageVariantId?: string | null;
};

/** File view for native markdown should edit the stored document, not the selected key. */
export function overlayCatDocumentFileViewSegment<
  T extends {
    id: string;
    key: string;
    sourceText: string;
    contentKind?: ContentEditorContentKind;
    sourceAssetUrl?: string | null;
    targetAssetUrl?: string | null;
    imageVariantId?: string | null;
    targetText?: string;
    sourcePath?: string;
  },
>(
  segment: T,
  fileContext: {
    sourcePath: string;
    documentView?: ContentEditorDocumentView | null;
  },
): T {
  const documentView = fileContext.documentView;
  if (!documentView || segment.contentKind === "document") {
    return segment;
  }

  return {
    ...segment,
    id: documentView.externalStringId,
    key: fileContext.sourcePath,
    sourceText: fileContext.sourcePath,
    sourcePath: fileContext.sourcePath,
    contentKind: "document",
    sourceAssetUrl: documentView.sourceAssetUrl ?? null,
    targetAssetUrl: documentView.targetAssetUrl ?? null,
    imageVariantId: documentView.imageVariantId ?? null,
    ...(segment.targetText !== undefined
      ? { targetText: documentView.targetAssetUrl ?? "" }
      : {}),
  };
}
