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

import { canInlineProjectFileText, maxInlineTextBytes } from "./project-file-inline-text";

describe("canInlineProjectFileText", () => {
  it("excludes PDF, Office, image, and video files", () => {
    for (const filename of ["brief.pdf", "brief.docx", "copy.xlsx", "hero.png", "clip.mp4"]) {
      expect(canInlineProjectFileText(filename, 8_192)).toBe(false);
    }
  });

  it("allows small text translation files", () => {
    expect(canInlineProjectFileText("messages.json", 128)).toBe(true);
    expect(canInlineProjectFileText("copy.md", 4_096)).toBe(true);
  });

  it("skips files over the inline size cap", () => {
    expect(canInlineProjectFileText("messages.json", maxInlineTextBytes + 1)).toBe(false);
  });
});
