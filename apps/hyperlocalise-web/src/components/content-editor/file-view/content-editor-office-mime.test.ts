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
import { describe, expect, it } from "vite-plus/test";

import {
  CAT_DOCX_UPLOAD_ACCEPT,
  CAT_PPTX_UPLOAD_ACCEPT,
  CAT_XLSX_UPLOAD_ACCEPT,
  contentEditorOfficeUploadAccept,
  officeExtensionForViewer,
  officeMimeTypeForViewer,
} from "./content-editor-office-mime";

describe("cat-office-mime", () => {
  it.each([
    ["docx", CAT_DOCX_UPLOAD_ACCEPT],
    ["xlsx", CAT_XLSX_UPLOAD_ACCEPT],
    ["pptx", CAT_PPTX_UPLOAD_ACCEPT],
  ] as const)("maps %s viewer upload accept strings", (viewerId, accept) => {
    expect(contentEditorOfficeUploadAccept(viewerId)).toBe(accept);
  });

  it("returns undefined accept for image and unknown viewers", () => {
    expect(contentEditorOfficeUploadAccept("image")).toBeUndefined();
    expect(contentEditorOfficeUploadAccept(null)).toBeUndefined();
  });

  it.each([
    ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
    ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
    ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"],
  ] as const)("maps %s viewer to MIME type and extension", (viewerId, mimeType, extension) => {
    expect(officeMimeTypeForViewer(viewerId)).toBe(mimeType);
    expect(officeExtensionForViewer(viewerId)).toBe(extension);
  });
});
