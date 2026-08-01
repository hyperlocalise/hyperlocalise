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

import { sourceContentType, sourceFilename } from "./source-file-metadata";

describe("sourceFilename", () => {
  it("returns the final path segment", () => {
    expect(sourceFilename("docs/briefs/overview.docx")).toBe("overview.docx");
  });
});

describe("sourceContentType", () => {
  it("maps office source extensions to Open XML MIME types", () => {
    expect(sourceContentType("docs/brief.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(sourceContentType("sheets/rates.xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(sourceContentType("sheets/legacy.xls")).toBe("application/vnd.ms-excel");
    expect(sourceContentType("decks/pitch.pptx")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
  });

  it("keeps text and image mappings for existing source formats", () => {
    expect(sourceContentType("messages/en.json")).toBe("application/json");
    expect(sourceContentType("assets/hero.png")).toBe("image/png");
    expect(sourceContentType("unknown.bin")).toBe("application/octet-stream");
  });
});
