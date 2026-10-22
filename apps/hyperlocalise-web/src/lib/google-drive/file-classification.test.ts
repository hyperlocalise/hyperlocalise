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
import {
  classifyGoogleDriveItem,
  hideGoogleDriveTranslationOutputsOnIngest,
} from "./file-classification";
import { GOOGLE_DRIVE_MAX_FILE_BYTES, GOOGLE_DRIVE_MAX_FOLDER_DEPTH } from "./limits";

describe("classifyGoogleDriveItem", () => {
  it("classifies Google Docs as supported docx ingest", () => {
    const result = classifyGoogleDriveItem({
      name: "Brief",
      mimeType: GOOGLE_MIME.document,
    });
    expect(result).toMatchObject({ kind: "supported", ingestKind: "google_doc" });
  });

  it("classifies Google Sheets as supported xlsx ingest", () => {
    expect(
      classifyGoogleDriveItem({
        name: "Budget",
        mimeType: GOOGLE_MIME.spreadsheet,
      }),
    ).toMatchObject({ kind: "supported", ingestKind: "google_sheet", ingestFormat: "xlsx" });
  });

  it("classifies Google Slides as supported pptx ingest", () => {
    expect(
      classifyGoogleDriveItem({
        name: "Kickoff",
        mimeType: GOOGLE_MIME.presentation,
      }),
    ).toMatchObject({ kind: "supported", ingestKind: "google_slide", ingestFormat: "pptx" });
  });

  it("skips PDF because it is not a Hyperlocalise source format", () => {
    expect(
      classifyGoogleDriveItem({
        name: "brief.pdf",
        mimeType: "application/pdf",
      }),
    ).toMatchObject({ kind: "skipped", reason: "unsupported_extension" });
  });

  it("imports uploaded Office files as binary downloads", () => {
    expect(
      classifyGoogleDriveItem({
        name: "overview.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toMatchObject({ kind: "supported", ingestKind: "binary", ingestFormat: "docx" });
  });

  it("skips files inside target locale folders when configured", () => {
    const result = classifyGoogleDriveItem({
      name: "Report.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: 1000,
      relativePath: "Briefs/vi-VN",
      translationOutput: "folder",
      targetLocales: ["vi-VN"],
    });
    expect(result).toMatchObject({ kind: "skipped", reason: "translation_output" });
  });

  it("imports files under source locale folders that are not push targets", () => {
    expect(
      classifyGoogleDriveItem({
        name: "overview.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 1000,
        relativePath: "Briefs/en",
        translationOutput: "folder",
        targetLocales: ["vi-VN"],
      }),
    ).toMatchObject({ kind: "supported", ingestFormat: "docx" });
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

  it("supports plain text files for import", () => {
    expect(
      classifyGoogleDriveItem({
        name: "ascii-art.txt",
        mimeType: "text/plain",
      }),
    ).toMatchObject({
      kind: "supported",
      ingestKind: "binary",
      ingestFormat: "txt",
      ingestExtension: ".txt",
    });
    expect(
      classifyGoogleDriveItem({
        name: "notes.txt",
        mimeType: "application/octet-stream",
      }),
    ).toMatchObject({
      kind: "supported",
      ingestFormat: "txt",
    });
    expect(
      classifyGoogleDriveItem({
        name: "readme",
        mimeType: "text/plain",
      }),
    ).toMatchObject({
      kind: "supported",
      ingestFormat: "txt",
      ingestExtension: ".txt",
    });
    expect(
      classifyGoogleDriveItem({
        name: "guide.md",
        mimeType: "text/plain",
      }),
    ).toMatchObject({
      kind: "supported",
      ingestFormat: "markdown",
    });
    expect(
      classifyGoogleDriveItem({
        name: "captions.srt",
        mimeType: "text/plain",
      }),
    ).toMatchObject({
      kind: "supported",
      ingestFormat: "srt",
    });
  });

  it("skips files over the size cap and folders deeper than the walk limit", () => {
    expect(
      classifyGoogleDriveItem({
        name: "overview.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: GOOGLE_DRIVE_MAX_FILE_BYTES + 1,
      }),
    ).toMatchObject({ kind: "skipped", reason: "file_too_large" });
    expect(
      classifyGoogleDriveItem({
        name: "overview.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        folderDepth: GOOGLE_DRIVE_MAX_FOLDER_DEPTH + 1,
      }),
    ).toMatchObject({ kind: "skipped", reason: "folder_depth_exceeded" });
    expect(
      classifyGoogleDriveItem({
        name: "overview.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: GOOGLE_DRIVE_MAX_FILE_BYTES,
        folderDepth: GOOGLE_DRIVE_MAX_FOLDER_DEPTH,
      }),
    ).toMatchObject({ kind: "supported", ingestFormat: "docx" });
  });

  it("keeps prefix translation outputs when hide is off", () => {
    expect(
      classifyGoogleDriveItem({
        name: "[vi-VN] guide.md",
        mimeType: "text/markdown",
        translationOutput: "prefix",
        hideTranslationOutputs: false,
      }),
    ).toMatchObject({ kind: "supported", ingestFormat: "markdown" });
  });
});

describe("hideGoogleDriveTranslationOutputsOnIngest", () => {
  it("hides outputs unless includeTranslatedFiles or the file was selected", () => {
    expect(
      hideGoogleDriveTranslationOutputsOnIngest({
        explicitlySelected: false,
        includeTranslatedFiles: false,
      }),
    ).toBe(true);
    expect(
      hideGoogleDriveTranslationOutputsOnIngest({
        explicitlySelected: false,
        includeTranslatedFiles: true,
      }),
    ).toBe(false);
    expect(
      hideGoogleDriveTranslationOutputsOnIngest({
        explicitlySelected: true,
        includeTranslatedFiles: false,
      }),
    ).toBe(false);
  });
});
