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
  buildFigmaSourcePath,
  figmaSourceFileNeedsReupload,
  parseTranslationFile,
  segmentsToTranslationFile,
} from "./segment-file";

describe("figma segment file", () => {
  it("builds source paths", () => {
    expect(buildFigmaSourcePath("abc123", "12:34")).toBe("figma/files/abc123/pages/12:34.json");
    expect(buildFigmaSourcePath("../oops", "page/a")).toBe("figma/files/oops/pages/page_a.json");
  });

  it("round-trips stamped keys and skips empty or legacy keys", () => {
    const file = segmentsToTranslationFile([
      {
        key: "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV",
        nodeId: "1:2",
        regionIndex: 0,
        text: "Hello",
      },
      {
        key: "figma.segment.1:2.0",
        nodeId: "1:2",
        regionIndex: 0,
        text: "Legacy",
      },
      {
        key: "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAW",
        nodeId: "1:3",
        regionIndex: 0,
        text: "   ",
      },
    ]);

    expect(file).toEqual({ "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV": "Hello" });
    expect(
      parseTranslationFile({
        "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV": "Hola",
        "figma.segment.1:1.0": "ignored legacy",
        ignored: 1,
      }),
    ).toEqual({ "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV": "Hola" });
  });

  it("flags legacy source files for reupload", () => {
    expect(figmaSourceFileNeedsReupload({ "figma.k.abc": "Hi" })).toBe(false);
    expect(figmaSourceFileNeedsReupload({ "figma.segment.1:1.0": "Hi" })).toBe(true);
  });
});
