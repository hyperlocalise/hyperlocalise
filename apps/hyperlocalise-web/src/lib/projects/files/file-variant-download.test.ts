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

import { fileVariantDownloadName } from "./file-variant-download";

describe("fileVariantDownloadName", () => {
  it("appends the locale before the stored extension", () => {
    expect(
      fileVariantDownloadName({
        sourcePath: "docs/guide.docx",
        locale: "de-DE",
        storedFilename: "guide.docx",
      }),
    ).toBe("guide-de-DE.docx");
  });

  it("prefers the stored file extension when it differs from the source", () => {
    expect(
      fileVariantDownloadName({
        sourcePath: "finance/rates.xls",
        locale: "fr-FR",
        storedFilename: "rates.xlsx",
      }),
    ).toBe("rates-fr-FR.xlsx");
  });

  it("does not double-append the locale when the basename already includes it", () => {
    expect(
      fileVariantDownloadName({
        sourcePath: "media/demo-fr-FR.mp4",
        locale: "fr-FR",
        storedFilename: "demo-fr-FR.mp4",
      }),
    ).toBe("demo-fr-FR.mp4");
  });

  it("falls back to the source extension when the stored filename has none", () => {
    expect(
      fileVariantDownloadName({
        sourcePath: "assets/banner.png",
        locale: "ja",
        storedFilename: "banner",
      }),
    ).toBe("banner-ja.png");
  });

  it("keeps nested path basenames only", () => {
    expect(
      fileVariantDownloadName({
        sourcePath: "nested/path/intro.md",
        locale: "es-ES",
        storedFilename: "intro.md",
      }),
    ).toBe("intro-es-ES.md");
  });
});
