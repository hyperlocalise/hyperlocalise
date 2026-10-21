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

  it("skips files inside locale folders by default", () => {
    const result = classifyGoogleDriveItem({
      name: "Report.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: 1000,
      relativePath: "Briefs/fr",
      translationOutput: "folder",
    });
    expect(result).toMatchObject({ kind: "skipped", reason: "translation_output" });
  });

  it("skips every translation output format when no mode is set", () => {
    const mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect(classifyGoogleDriveItem({ name: "[fr] Report.docx", mimeType })).toMatchObject({
      kind: "skipped",
      reason: "translation_output",
    });
    expect(classifyGoogleDriveItem({ name: "Report [fr].docx", mimeType })).toMatchObject({
      kind: "skipped",
      reason: "translation_output",
    });
    expect(classifyGoogleDriveItem({ name: "Report_fr.docx", mimeType })).toMatchObject({
      kind: "skipped",
      reason: "translation_output",
    });
  });

  it("skips prefix, suffix, and underscore translation names", () => {
    const mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect(
      classifyGoogleDriveItem({
        name: "[fr] Report.docx",
        mimeType,
        translationOutput: "prefix",
      }),
    ).toMatchObject({ kind: "skipped", reason: "translation_output" });
    expect(
      classifyGoogleDriveItem({
        name: "Report [fr].docx",
        mimeType,
        translationOutput: "suffix",
      }),
    ).toMatchObject({ kind: "skipped", reason: "translation_output" });
    expect(
      classifyGoogleDriveItem({
        name: "Report_fr.docx",
        mimeType,
        translationOutput: "underscore",
      }),
    ).toMatchObject({ kind: "skipped", reason: "translation_output" });
  });
});
