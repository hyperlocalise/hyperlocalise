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
  appendStoredFileContext,
  buildStoredFileContext,
  toStoredTranslationFileRef,
} from "./stored-file-context";

describe("stored file context", () => {
  it("maps supported text, image, and video uploads to translation file refs", () => {
    expect(
      toStoredTranslationFileRef({
        id: "file_json",
        filename: "messages.json",
        contentType: "application/json",
      }),
    ).toEqual({
      id: "file_json",
      filename: "messages.json",
      contentType: "application/json",
      fileFormat: "json",
    });
    expect(
      toStoredTranslationFileRef({
        id: "file_png",
        filename: "banner.png",
        contentType: "image/png",
      }),
    ).toMatchObject({ fileFormat: "png" });
    expect(
      toStoredTranslationFileRef({
        id: "file_mp4",
        filename: "clip.mp4",
        contentType: "video/mp4",
      }),
    ).toMatchObject({ fileFormat: "mp4" });
  });

  it("skips office and unsupported uploads that cannot become file translation jobs", () => {
    expect(
      toStoredTranslationFileRef({
        id: "file_docx",
        filename: "brief.docx",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBeNull();
    expect(
      toStoredTranslationFileRef({
        id: "file_pdf",
        filename: "brief.pdf",
        contentType: "application/pdf",
      }),
    ).toBeNull();
  });

  it("appends sourceFileId markers the agent can use for file jobs", () => {
    const files = [
      {
        id: "file_png",
        filename: "banner.png",
        contentType: "image/png",
        fileFormat: "png" as const,
      },
    ];

    expect(buildStoredFileContext(files)).toContain("sourceFileId=file_png");
    expect(buildStoredFileContext(files)).toContain("fileFormat=png");
    expect(appendStoredFileContext("Localize to ja-JP", files)).toBe(
      [
        "Localize to ja-JP",
        "",
        "Attached translation source files are already stored and ready for file translation jobs:",
        "- banner.png: sourceFileId=file_png, fileFormat=png, contentType=image/png",
        "Use these sourceFileId values when creating file translation jobs.",
      ].join("\n"),
    );
    expect(appendStoredFileContext("  ", files)).toContain(
      "Please translate the attached source file.",
    );
  });
});
