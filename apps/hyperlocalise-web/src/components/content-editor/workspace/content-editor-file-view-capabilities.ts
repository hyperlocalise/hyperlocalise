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
const FILE_ONLY_VIEWS = ["file"] as const satisfies readonly ContentEditorWorkspaceViewMode[];

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
}): ContentEditorFileViewCapabilities {
  const sourcePath = input.sourcePath?.trim() ?? "";
  const contentKind = input.contentKind ?? null;

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
    return {
      family: "document",
      availableViews: FILE_ONLY_VIEWS,
      defaultView: "file",
      viewerId: "markdown",
    };
  }

  // String Content Editor files and unknown paths stay in segment views.
  return {
    family: "text",
    availableViews: SEGMENT_VIEWS,
    defaultView: "comfortable",
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
