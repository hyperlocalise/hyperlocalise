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
  segmentKey,
  buildSourcePath,
  segmentsToTranslationFile,
  parseTranslationFile,
} from "./segment-file";

describe("canva segment-file", () => {
  it("builds stable segment keys and source paths", () => {
    expect(segmentKey(1, 2, 3)).toBe("canva.segment.1.2.3");
    expect(buildSourcePath("design-123")).toBe("canva/designs/design-123.json");
  });

  it("serializes and parses translation files", () => {
    const segments = [
      {
        key: "canva.segment.0.0.0",
        pageIndex: 0,
        contentIndex: 0,
        regionIndex: 0,
        text: "Hello",
      },
    ];

    expect(segmentsToTranslationFile(segments)).toEqual({
      "canva.segment.0.0.0": "Hello",
    });

    expect(
      parseTranslationFile({
        "canva.segment.0.0.0": "Hola",
        ignored: "value",
      }),
    ).toEqual({
      "canva.segment.0.0.0": "Hola",
    });
  });
});
