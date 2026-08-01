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
  inferSupportedImageTranslationFileFormat,
  inferSupportedOfficeTranslationFileFormat,
} from "@/lib/translation/file-formats";

import type { CatWorkspaceViewMode } from "./cat-workspace-view-mode";

export type CatFileViewFamily = "image" | "text" | "office";

export type CatFileViewerId = "image" | "docx" | "xlsx" | "pptx";

export type CatFileViewCapabilities = {
  family: CatFileViewFamily;
  availableViews: readonly CatWorkspaceViewMode[];
  defaultView: CatWorkspaceViewMode;
  viewerId: CatFileViewerId | null;
};

const SEGMENT_VIEWS = [
  "comfortable",
  "side-by-side",
] as const satisfies readonly CatWorkspaceViewMode[];
const IMAGE_VIEWS = [
  "file",
  "comfortable",
  "side-by-side",
] as const satisfies readonly CatWorkspaceViewMode[];
const OFFICE_VIEWS = ["file"] as const satisfies readonly CatWorkspaceViewMode[];

function extensionOf(sourcePath: string): string | null {
  const basename = sourcePath.split(/[\\/]/).pop() ?? sourcePath;
  const dotIndex = basename.lastIndexOf(".");
  if (dotIndex <= 0) {
    return null;
  }
  return basename.slice(dotIndex).toLowerCase();
}

function officeViewerIdForExtension(extension: string | null): CatFileViewerId | null {
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
  contentKind?: "text" | "image_file" | "image_url" | "office_file" | null;
}): CatFileViewCapabilities {
  const sourcePath = input.sourcePath?.trim() ?? "";
  const contentKind = input.contentKind ?? null;

  if (contentKind === "image_file" || inferSupportedImageTranslationFileFormat(sourcePath)) {
    return {
      family: "image",
      availableViews: IMAGE_VIEWS,
      defaultView: "file",
      viewerId: "image",
    };
  }

  const extension = extensionOf(sourcePath);
  const officeFormat =
    contentKind === "office_file" || inferSupportedOfficeTranslationFileFormat(sourcePath);
  if (officeFormat) {
    return {
      family: "office",
      availableViews: OFFICE_VIEWS,
      defaultView: "file",
      viewerId: officeViewerIdForExtension(extension) ?? "docx",
    };
  }

  // String CAT files and unknown paths stay in segment views.
  return {
    family: "text",
    availableViews: SEGMENT_VIEWS,
    defaultView: "comfortable",
    viewerId: null,
  };
}

export function clampCatWorkspaceViewMode(
  mode: CatWorkspaceViewMode,
  capabilities: CatFileViewCapabilities,
): CatWorkspaceViewMode {
  if (capabilities.availableViews.includes(mode)) {
    return mode;
  }
  return capabilities.defaultView;
}

export function isCatFileViewAvailable(capabilities: CatFileViewCapabilities) {
  return capabilities.availableViews.includes("file");
}
