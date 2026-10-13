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

import { buildPageSourcePath, buildSourcePath, normalizeSegmentText } from "./segment-file";

describe("segment-file", () => {
  it("builds source paths", () => {
    expect(buildSourcePath("design-123")).toBe("canva/designs/design-123.json");
    expect(buildPageSourcePath("mic", "DAF1", 0)).toBe("canva/designs/mic-DAF1/page-1.json");
    expect(buildPageSourcePath("mic", "DAF2", 1)).toBe("canva/designs/mic-DAF2/page-2.json");
  });

  it("normalizes unicode, whitespace, and line breaks", () => {
    expect(normalizeSegmentText("  Hello\n\n  world  ")).toBe("Hello world");
    expect(normalizeSegmentText("café")).toBe(normalizeSegmentText("cafe\u0301"));
  });
});
