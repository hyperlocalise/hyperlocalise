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
  clampCatWorkspaceViewMode,
  isCatFileViewAvailable,
  resolveCatFileViewCapabilities,
} from "./content-editor-file-view-capabilities";

describe("cat-file-view-capabilities", () => {
  it("enables file view for image paths", () => {
    const capabilities = resolveCatFileViewCapabilities({
      sourcePath: "assets/hero.png",
    });

    expect(capabilities).toEqual({
      family: "image",
      availableViews: ["file"],
      defaultView: "file",
      viewerId: "image",
    });
    expect(isCatFileViewAvailable(capabilities)).toBe(true);
  });

  it("enables file view for image_file content kind", () => {
    const capabilities = resolveCatFileViewCapabilities({
      sourcePath: "CAT_ALL_FILES",
      contentKind: "image_file",
    });

    expect(capabilities.family).toBe("image");
    expect(capabilities.viewerId).toBe("image");
    expect(capabilities.defaultView).toBe("file");
  });

  it("enables file view for video paths", () => {
    const capabilities = resolveCatFileViewCapabilities({
      sourcePath: "assets/hero.mp4",
    });

    expect(capabilities).toEqual({
      family: "video",
      availableViews: ["file"],
      defaultView: "file",
      viewerId: "video",
    });
    expect(isCatFileViewAvailable(capabilities)).toBe(true);
  });

  it("enables file view for video_file content kind", () => {
    const capabilities = resolveCatFileViewCapabilities({
      sourcePath: "CAT_ALL_FILES",
      contentKind: "video_file",
    });

    expect(capabilities.family).toBe("video");
    expect(capabilities.viewerId).toBe("video");
    expect(capabilities.defaultView).toBe("file");
  });

  it("keeps segment views for text files", () => {
    const capabilities = resolveCatFileViewCapabilities({
      sourcePath: "locales/en.json",
    });

    expect(capabilities).toEqual({
      family: "text",
      availableViews: ["comfortable", "side-by-side"],
      defaultView: "comfortable",
      viewerId: null,
    });
    expect(isCatFileViewAvailable(capabilities)).toBe(false);
  });

  it("registers Univer viewers for office paths", () => {
    expect(resolveCatFileViewCapabilities({ sourcePath: "docs/brief.docx" })).toEqual({
      family: "office",
      availableViews: ["file"],
      defaultView: "file",
      viewerId: "docx",
    });
    expect(resolveCatFileViewCapabilities({ sourcePath: "sheets/rates.xlsx" }).viewerId).toBe(
      "xlsx",
    );
    expect(resolveCatFileViewCapabilities({ sourcePath: "decks/pitch.pptx" }).viewerId).toBe(
      "pptx",
    );
    expect(
      resolveCatFileViewCapabilities({
        sourcePath: "CAT_ALL_FILES",
        contentKind: "office_file",
      }).family,
    ).toBe("office");
  });

  it("defaults markdown and mdx to file view with the document editor", () => {
    expect(resolveCatFileViewCapabilities({ sourcePath: "docs/intro.md" })).toEqual({
      family: "document",
      availableViews: ["file"],
      defaultView: "file",
      viewerId: "markdown",
    });
    expect(resolveCatFileViewCapabilities({ sourcePath: "docs/page.mdx" }).viewerId).toBe(
      "markdown",
    );
    expect(
      resolveCatFileViewCapabilities({
        sourcePath: "CAT_ALL_FILES",
        contentKind: "document",
      }).family,
    ).toBe("document");
  });

  it("clamps disallowed modes to the family default", () => {
    const text = resolveCatFileViewCapabilities({ sourcePath: "a.json" });
    expect(clampCatWorkspaceViewMode("file", text)).toBe("comfortable");

    const image = resolveCatFileViewCapabilities({ sourcePath: "a.webp" });
    expect(clampCatWorkspaceViewMode("comfortable", image)).toBe("file");
    expect(clampCatWorkspaceViewMode("file", image)).toBe("file");
  });
});
