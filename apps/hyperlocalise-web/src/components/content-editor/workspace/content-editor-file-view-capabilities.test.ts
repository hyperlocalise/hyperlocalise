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
  contentEditorMultilingualGallerySegments,
  isCatDocumentFileViewSegmentId,
  isCatFileViewAvailable,
  overlayCatDocumentFileViewSegment,
  isCatImageFileSegment,
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

  it("keeps segment views for string resource files", () => {
    const capabilities = resolveCatFileViewCapabilities({
      sourcePath: "locales/en.json",
    });

    expect(capabilities).toEqual({
      family: "text",
      availableViews: ["comfortable", "side-by-side"],
      defaultView: "side-by-side",
      viewerId: null,
    });
    expect(isCatFileViewAvailable(capabilities)).toBe(false);

    expect(resolveCatFileViewCapabilities({ sourcePath: "ios/Localizable.strings" })).toEqual(
      capabilities,
    );
    expect(resolveCatFileViewCapabilities({ sourcePath: "android/strings.xml" })).toEqual(
      capabilities,
    );
  });

  it("falls back to segment views for paths with no recognised format", () => {
    expect(resolveCatFileViewCapabilities({ sourcePath: "CAT_ALL_FILES" }).family).toBe("text");
    expect(resolveCatFileViewCapabilities({ sourcePath: "" }).family).toBe("text");
  });

  it("offers the multilingual view only when a table configuration exists", () => {
    expect(
      resolveCatFileViewCapabilities({
        sourcePath: "locales/en.json",
        multilingualViewAvailable: true,
      }).availableViews,
    ).toEqual(["comfortable", "side-by-side", "multilingual"]);

    expect(
      resolveCatFileViewCapabilities({
        sourcePath: "locales/en.json",
        multilingualViewAvailable: false,
      }).availableViews,
    ).toEqual(["comfortable", "side-by-side"]);
  });

  it("keeps office and video on file view even when multilingual is configured", () => {
    for (const sourcePath of ["docs/brief.docx", "media/promo.mp4"]) {
      expect(
        resolveCatFileViewCapabilities({ sourcePath, multilingualViewAvailable: true })
          .availableViews,
      ).toEqual(["file"]);
    }
  });

  it("offers the multilingual gallery for images when a locale configuration exists", () => {
    expect(
      resolveCatFileViewCapabilities({
        sourcePath: "marketing/hero.png",
        multilingualViewAvailable: true,
      }).availableViews,
    ).toEqual(["file", "multilingual"]);
    expect(
      resolveCatFileViewCapabilities({ sourcePath: "marketing/hero.png" }).availableViews,
    ).toEqual(["file"]);
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

  it("defaults native markdown, mdx, and asciidoc to document view and also offers segment views", () => {
    expect(resolveCatFileViewCapabilities({ sourcePath: "docs/intro.md" })).toEqual({
      family: "document",
      availableViews: ["comfortable", "side-by-side", "file"],
      defaultView: "file",
      viewerId: "markdown",
    });
    expect(resolveCatFileViewCapabilities({ sourcePath: "docs/page.mdx" }).viewerId).toBe(
      "markdown",
    );
    expect(resolveCatFileViewCapabilities({ sourcePath: "docs/guide.adoc" })).toEqual({
      family: "document",
      availableViews: ["comfortable", "side-by-side", "file"],
      defaultView: "file",
      viewerId: "markdown",
    });
    expect(
      resolveCatFileViewCapabilities({
        sourcePath: "CAT_ALL_FILES",
        contentKind: "document",
      }).family,
    ).toBe("document");
    expect(
      resolveCatFileViewCapabilities({
        sourcePath: "docs/intro.md",
        multilingualViewAvailable: true,
      }).availableViews,
    ).toEqual(["comfortable", "side-by-side", "multilingual", "file"]);
  });

  it("keeps Crowdin markdown in string segment view", () => {
    expect(
      resolveCatFileViewCapabilities({
        sourcePath: "docs/intro.md",
        providerKind: "crowdin",
      }),
    ).toEqual({
      family: "text",
      availableViews: ["comfortable", "side-by-side"],
      defaultView: "side-by-side",
      viewerId: null,
    });
    expect(
      resolveCatFileViewCapabilities({
        sourcePath: "docs/page.mdx",
        providerKind: "crowdin",
        multilingualViewAvailable: true,
      }).availableViews,
    ).toEqual(["comfortable", "side-by-side", "multilingual"]);
    expect(
      resolveCatFileViewCapabilities({
        sourcePath: "guide.md",
        contentKind: "document",
        providerKind: "smartling",
      }).family,
    ).toBe("text");
  });

  it("clamps disallowed modes to the family default", () => {
    const text = resolveCatFileViewCapabilities({ sourcePath: "a.json" });
    expect(clampCatWorkspaceViewMode("file", text)).toBe("side-by-side");
    expect(clampCatWorkspaceViewMode("multilingual", text)).toBe("side-by-side");

    const multilingualText = resolveCatFileViewCapabilities({
      sourcePath: "a.json",
      multilingualViewAvailable: true,
    });
    expect(clampCatWorkspaceViewMode("multilingual", multilingualText)).toBe("multilingual");

    const image = resolveCatFileViewCapabilities({ sourcePath: "a.webp" });
    expect(clampCatWorkspaceViewMode("comfortable", image)).toBe("file");
    expect(clampCatWorkspaceViewMode("file", image)).toBe("file");
    expect(clampCatWorkspaceViewMode("multilingual", image)).toBe("file");

    const multilingualImage = resolveCatFileViewCapabilities({
      sourcePath: "a.webp",
      multilingualViewAvailable: true,
    });
    expect(clampCatWorkspaceViewMode("multilingual", multilingualImage)).toBe("multilingual");

    const nativeMarkdown = resolveCatFileViewCapabilities({ sourcePath: "docs/intro.md" });
    expect(clampCatWorkspaceViewMode("comfortable", nativeMarkdown)).toBe("comfortable");
    expect(clampCatWorkspaceViewMode("file", nativeMarkdown)).toBe("file");

    const crowdinMarkdown = resolveCatFileViewCapabilities({
      sourcePath: "docs/intro.md",
      providerKind: "crowdin",
    });
    expect(clampCatWorkspaceViewMode("file", crowdinMarkdown)).toBe("side-by-side");
    expect(clampCatWorkspaceViewMode("comfortable", crowdinMarkdown)).toBe("comfortable");
  });

  it("overlays native markdown file view onto the stored document, not the selected key", () => {
    const overlay = overlayCatDocumentFileViewSegment(
      {
        id: "key-uuid",
        key: "md.Heading[0]",
        sourceText: "Intro",
        targetText: "Intro FR",
        sourcePath: "docs/intro.md",
      },
      {
        sourcePath: "docs/intro.md",
        documentView: {
          externalStringId: "file_1",
          sourceAssetUrl: "/source.md",
          targetAssetUrl: "/target.md",
          imageVariantId: "variant_md",
        },
      },
    );

    expect(overlay).toMatchObject({
      id: "file_1",
      key: "docs/intro.md",
      sourceText: "docs/intro.md",
      contentKind: "document",
      sourceAssetUrl: "/source.md",
      targetAssetUrl: "/target.md",
      imageVariantId: "variant_md",
      targetText: "/target.md",
    });
    expect(isCatDocumentFileViewSegmentId(overlay.id, { externalStringId: "file_1" })).toBe(true);
    expect(isCatDocumentFileViewSegmentId("key-uuid", { externalStringId: "file_1" })).toBe(false);
  });

  it("keeps an already file-backed document segment unchanged", () => {
    const segment = {
      id: "file_1",
      key: "docs/intro.md",
      sourceText: "docs/intro.md",
      contentKind: "document" as const,
      sourceAssetUrl: "/source.md",
    };

    expect(
      overlayCatDocumentFileViewSegment(segment, {
        sourcePath: "docs/intro.md",
        documentView: {
          externalStringId: "ignored",
          sourceAssetUrl: "/other.md",
        },
      }),
    ).toEqual(segment);
  });

  it("keeps the multilingual gallery on the selected image file in a mixed queue", () => {
    const hero = {
      id: "hero",
      sourcePath: "marketing/hero.png",
      contentKind: "image_file" as const,
    };
    const copy = { id: "copy", sourcePath: "locales/en.json", contentKind: "text" as const };
    const video = {
      id: "promo",
      sourcePath: "marketing/promo.mp4",
      contentKind: "video_file" as const,
    };
    const banner = {
      id: "banner",
      sourcePath: "marketing/banner.png",
      contentKind: "image_file" as const,
    };

    expect(isCatImageFileSegment(hero)).toBe(true);
    expect(isCatImageFileSegment(copy)).toBe(false);
    expect(contentEditorMultilingualGallerySegments([hero, copy, video, banner], hero)).toEqual([
      hero,
    ]);
    expect(contentEditorMultilingualGallerySegments([hero, copy, video, banner], copy)).toEqual([]);
    expect(contentEditorMultilingualGallerySegments([hero, copy], null)).toEqual([]);

    const heroAlt = { ...hero, id: "hero-alt" };
    expect(contentEditorMultilingualGallerySegments([hero, heroAlt, copy], hero)).toEqual([
      hero,
      heroAlt,
    ]);
  });
});
