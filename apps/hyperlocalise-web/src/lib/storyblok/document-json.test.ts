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
  buildStoryblokImportPayload,
  buildStoryblokStorySourcePath,
  existingStoryblokTranslations,
  splitStoryblokExport,
} from "./document-json";

describe("splitStoryblokExport", () => {
  it("separates meta keys and drops empty strings", () => {
    expect(
      splitStoryblokExport({
        page: "123",
        language: "default",
        url: "home",
        text_nodes: 0,
        "a:page:title": "Hello",
        "a:page:subtitle": "  ",
        "b:paragraph:@richtext:richtext/content[0:paragraph].content[0].text": "Body",
      }),
    ).toEqual({
      strings: {
        "a:page:title": "Hello",
        "b:paragraph:@richtext:richtext/content[0:paragraph].content[0].text": "Body",
      },
      meta: { page: "123", language: "default", url: "home", text_nodes: 0 },
    });
  });
});

describe("existingStoryblokTranslations", () => {
  it("treats values equal to the source as untranslated", () => {
    expect(
      existingStoryblokTranslations({
        source: { title: "Hello", body: "World", gone: "x" },
        target: { title: "Hallo", body: "World", extra: "Neu", language: "de" },
      }),
    ).toEqual({ title: "Hallo" });
  });
});

describe("buildStoryblokImportPayload", () => {
  it("overlays approved translations on the current target export", () => {
    const result = buildStoryblokImportPayload({
      currentTarget: { page: "1", language: "de", title: "Alt", body: "Body" },
      source: { title: "Title", body: "Body" },
      approved: { title: "Titel", removed: "Weg" },
      langCode: "de",
    });

    expect(result.changedKeys).toBe(1);
    expect(result.payload).toEqual({ page: "1", language: "de", title: "Titel", body: "Body" });
  });

  it("reports no change when approved text already matches", () => {
    expect(
      buildStoryblokImportPayload({
        currentTarget: { title: "Titel" },
        source: { title: "Title" },
        approved: { title: "Titel" },
        langCode: "de",
      }).changedKeys,
    ).toBe(0);
  });
});

describe("buildStoryblokStorySourcePath", () => {
  it("keeps folder structure and sanitises segments", () => {
    expect(
      buildStoryblokStorySourcePath({ spaceId: "7", fullSlug: "blog/My Post!", storyId: "9" }),
    ).toBe("storyblok/7/blog/My-Post-.json");
  });

  it("drops dot segments and falls back to the story id", () => {
    expect(buildStoryblokStorySourcePath({ spaceId: "7", fullSlug: "../..", storyId: "9" })).toBe(
      "storyblok/7/story-9.json",
    );
  });
});
