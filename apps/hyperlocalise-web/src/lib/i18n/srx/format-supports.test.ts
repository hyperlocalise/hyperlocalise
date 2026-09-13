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

import { sourcePathSupportsSrxSegmentation } from "./format-supports";

describe("sourcePathSupportsSrxSegmentation", () => {
  it("allows JSON and markdown paths", () => {
    expect(sourcePathSupportsSrxSegmentation("locales/en.json")).toBe(true);
    expect(sourcePathSupportsSrxSegmentation("docs/readme.md")).toBe(true);
  });

  it("rejects already-segmented formats", () => {
    expect(sourcePathSupportsSrxSegmentation("strings.xliff")).toBe(false);
    expect(sourcePathSupportsSrxSegmentation("movie.srt")).toBe(false);
  });
});
