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

import { isContentEditorImageGenerating } from "./content-editor-image-generation-state";

describe("isContentEditorImageGenerating", () => {
  it("is true only for the image and locale being generated", () => {
    expect(
      isContentEditorImageGenerating({
        isPending: true,
        pendingExternalStringId: "hero",
        pendingTargetLocale: "fr",
        targetLocale: "fr",
        externalStringId: "hero",
      }),
    ).toBe(true);
  });

  it("is false when another image in the same locale is selected", () => {
    expect(
      isContentEditorImageGenerating({
        isPending: true,
        pendingExternalStringId: "hero",
        pendingTargetLocale: "fr",
        targetLocale: "fr",
        externalStringId: "banner",
      }),
    ).toBe(false);
  });

  it("is false when generation is for a different locale", () => {
    expect(
      isContentEditorImageGenerating({
        isPending: true,
        pendingExternalStringId: "hero",
        pendingTargetLocale: "de",
        targetLocale: "fr",
        externalStringId: "hero",
      }),
    ).toBe(false);
  });

  it("treats a missing pending locale as the workspace locale", () => {
    expect(
      isContentEditorImageGenerating({
        isPending: true,
        pendingExternalStringId: "hero",
        targetLocale: "fr",
        externalStringId: "hero",
      }),
    ).toBe(true);
  });

  it("keeps unscoped pending generation visible on the current image", () => {
    expect(
      isContentEditorImageGenerating({
        isPending: true,
        targetLocale: "fr",
        externalStringId: "banner",
      }),
    ).toBe(true);
  });
});
