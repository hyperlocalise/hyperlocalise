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
  isPublicMediaStoredFile,
  publicMediaAssetPath,
  publicMediaAssetUrl,
  publicMediaMetadata,
} from "./public-media";

describe("public media helpers", () => {
  it("requires publicMedia metadata and an image content type", () => {
    expect(
      isPublicMediaStoredFile({
        contentType: "image/png",
        metadata: publicMediaMetadata(),
      }),
    ).toBe(true);
    expect(
      isPublicMediaStoredFile({
        contentType: "image/png",
        metadata: {},
      }),
    ).toBe(false);
    expect(
      isPublicMediaStoredFile({
        contentType: "application/json",
        metadata: publicMediaMetadata(),
      }),
    ).toBe(false);
  });

  it("builds public paths without org or project segments", () => {
    expect(publicMediaAssetPath("file_abc")).toBe("/api/public/media/file_abc");
    expect(publicMediaAssetUrl({ fileId: "file_abc", origin: "https://app.example.com" })).toBe(
      "https://app.example.com/api/public/media/file_abc",
    );
  });
});
