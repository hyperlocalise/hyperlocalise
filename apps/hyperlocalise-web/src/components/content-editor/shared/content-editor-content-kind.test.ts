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

import { isContentEditorAssetContentKind } from "./content-editor-content-kind";

describe("isContentEditorAssetContentKind", () => {
  it("treats image and video kinds as assets", () => {
    expect(isContentEditorAssetContentKind("image_file")).toBe(true);
    expect(isContentEditorAssetContentKind("image_url")).toBe(true);
    expect(isContentEditorAssetContentKind("video_file")).toBe(true);
    expect(isContentEditorAssetContentKind("video_url")).toBe(true);
  });

  it("leaves text and document kinds as non-assets", () => {
    expect(isContentEditorAssetContentKind("text")).toBe(false);
    expect(isContentEditorAssetContentKind("document")).toBe(false);
    expect(isContentEditorAssetContentKind("office_file")).toBe(false);
    expect(isContentEditorAssetContentKind(undefined)).toBe(false);
  });
});
