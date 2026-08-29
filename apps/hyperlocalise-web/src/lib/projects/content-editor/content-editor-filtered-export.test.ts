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
  buildCatFilteredExportFilename,
  serializeCatFilteredExport,
  serializeCatFilteredExportCsv,
  serializeCatFilteredExportTmx,
  serializeCatFilteredExportXliff,
  type ContentEditorFilteredExportRow,
} from "./content-editor-filtered-export";

const sampleRows: ContentEditorFilteredExportRow[] = [
  {
    key: 'greet,"user"',
    sourceText: "Hello\nworld",
    targetText: "Xin chào",
    sourceLocale: "en",
    targetLocale: "vi",
    sourcePath: "locales/en.json",
  },
];

describe("serializeCatFilteredExportCsv", () => {
  it("escapes commas, quotes, and newlines", () => {
    const csv = serializeCatFilteredExportCsv(sampleRows);
    expect(csv).toContain('"greet,""user"""');
    expect(csv).toContain('"Hello\nworld"');
    expect(csv.startsWith("key,source_locale,")).toBe(true);
  });
});

describe("serializeCatFilteredExportTmx", () => {
  it("emits TMX translation units", () => {
    const tmx = serializeCatFilteredExportTmx(sampleRows);
    expect(tmx).toContain('<tmx version="1.4">');
    expect(tmx).toContain('tuid="greet,&quot;user&quot;"');
    expect(tmx).toContain("<seg>Xin chào</seg>");
  });
});

describe("serializeCatFilteredExportXliff", () => {
  it("emits XLIFF 1.2 units for both xlf and xliff", () => {
    const xliff = serializeCatFilteredExportXliff(sampleRows);
    expect(xliff).toContain('<xliff version="1.2"');
    expect(xliff).toContain('source-language="en"');
    expect(xliff).toContain("Xin chào");
    expect(serializeCatFilteredExport("xlf", sampleRows).extension).toBe("xlf");
    expect(serializeCatFilteredExport("xliff", sampleRows).extension).toBe("xliff");
  });
});

describe("buildCatFilteredExportFilename", () => {
  it("uses all-files for wildcard source paths", () => {
    expect(
      buildCatFilteredExportFilename({
        sourcePath: "*",
        targetLocale: "vi",
        extension: "csv",
      }),
    ).toBe("all-files-vi.csv");
  });
});
