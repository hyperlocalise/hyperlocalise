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

import { figmaProjectLocalesMatch, isProjectSourceLocale } from "./figma-locale-match";

describe("figmaProjectLocalesMatch", () => {
  it("matches canonical project tags case-insensitively", () => {
    expect(figmaProjectLocalesMatch("en-US", "en-us")).toBe(true);
    expect(figmaProjectLocalesMatch("vi-VN", "vi-vn")).toBe(true);
  });

  it("does not collapse language-only tags to regional project locales", () => {
    expect(figmaProjectLocalesMatch("en", "en-US")).toBe(false);
    expect(figmaProjectLocalesMatch("vi-VN", "vi")).toBe(false);
    expect(figmaProjectLocalesMatch("zh-CN", "zh-TW")).toBe(false);
  });
});

describe("isProjectSourceLocale", () => {
  it("uses exact project locale identity", () => {
    expect(isProjectSourceLocale("en-US", "en-us")).toBe(true);
    expect(isProjectSourceLocale("en", "en-US")).toBe(false);
    expect(isProjectSourceLocale("en-US", "fr-FR")).toBe(false);
  });
});
