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
  inferCatBilingualFormat,
} from "./content-editor-filtered-export";

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

describe("inferCatBilingualFormat", () => {
  it("maps export extensions", () => {
    expect(inferCatBilingualFormat("queue-fr.xliff")).toBe("xliff");
    expect(inferCatBilingualFormat("queue-fr.XLF")).toBe("xlf");
    expect(inferCatBilingualFormat("notes.txt")).toBeNull();
  });
});
