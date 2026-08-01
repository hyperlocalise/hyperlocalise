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
import type { CatFileViewerId } from "@/components/cat/workspace/cat-file-view-capabilities";

export const CAT_DOCX_UPLOAD_ACCEPT =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx";

export const CAT_XLSX_UPLOAD_ACCEPT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.xlsx,.xls";

export const CAT_PPTX_UPLOAD_ACCEPT =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx";

export function catOfficeUploadAccept(viewerId: CatFileViewerId | null): string | undefined {
  switch (viewerId) {
    case "image":
      return undefined;
    case "docx":
      return CAT_DOCX_UPLOAD_ACCEPT;
    case "xlsx":
      return CAT_XLSX_UPLOAD_ACCEPT;
    case "pptx":
      return CAT_PPTX_UPLOAD_ACCEPT;
    default:
      return undefined;
  }
}

export function officeMimeTypeForViewer(viewerId: "docx" | "xlsx" | "pptx"): string {
  switch (viewerId) {
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
}

export function officeExtensionForViewer(viewerId: "docx" | "xlsx" | "pptx"): string {
  return `.${viewerId === "xlsx" ? "xlsx" : viewerId}`;
}
