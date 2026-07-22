/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  buildSourcePath,
  parseTranslationFile,
  segmentKey,
  segmentsToTranslationFile,
} from "./segment-file";

describe("segment-file", () => {
  it("builds stable segment keys and source paths", () => {
    expect(segmentKey(1, 2, 3)).toBe("canva.segment.1.2.3");
    expect(buildSourcePath("design-123")).toBe("canva/designs/design-123.json");
  });

  it("serializes and parses translation files", () => {
    const file = segmentsToTranslationFile([
      {
        key: "canva.segment.0.0.0",
        pageIndex: 0,
        contentIndex: 0,
        regionIndex: 0,
        text: "Hello",
      },
      {
        key: "canva.segment.0.0.1",
        pageIndex: 0,
        contentIndex: 0,
        regionIndex: 1,
        text: "World",
      },
    ]);

    expect(file).toEqual({
      "canva.segment.0.0.0": "Hello",
      "canva.segment.0.0.1": "World",
    });

    expect(parseTranslationFile(file)).toEqual(file);
  });
});
