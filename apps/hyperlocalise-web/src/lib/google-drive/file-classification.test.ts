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

import { GOOGLE_MIME } from "./constants";
import { classifyGoogleDriveItem } from "./file-classification";

describe("classifyGoogleDriveItem", () => {
  it("classifies Google Docs as supported docx ingest", () => {
    const result = classifyGoogleDriveItem({
      name: "Brief",
      mimeType: GOOGLE_MIME.document,
    });
    expect(result).toMatchObject({ kind: "supported", ingestKind: "google_doc" });
  });

  it("skips translation-prefixed files by default", () => {
    const result = classifyGoogleDriveItem({
      name: "[fr-FR] Report.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: 1000,
    });
    expect(result).toMatchObject({ kind: "skipped", reason: "translation_output" });
  });
});
