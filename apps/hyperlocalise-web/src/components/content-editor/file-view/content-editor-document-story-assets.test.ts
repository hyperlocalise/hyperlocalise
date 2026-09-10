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
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import {
  CAT_STORY_DOCUMENT_ERROR_TARGET_URL,
  CAT_STORY_DOCUMENT_MDX_SOURCE_URL,
  CAT_STORY_DOCUMENT_SOURCE_URL,
  CAT_STORY_DOCUMENT_TARGET_URL,
} from "./content-editor-document-story-assets";

describe("content editor document story assets", () => {
  it("uses Storybook CAT document asset URLs", () => {
    expect(CAT_STORY_DOCUMENT_SOURCE_URL).toBe("/storybook/cat/content/intro.source.md");
    expect(CAT_STORY_DOCUMENT_TARGET_URL).toBe("/storybook/cat/content/intro.target.md");
    expect(CAT_STORY_DOCUMENT_MDX_SOURCE_URL).toBe("/storybook/cat/content/guide.source.mdx");
    expect(CAT_STORY_DOCUMENT_ERROR_TARGET_URL).toBe("/storybook/cat/content/missing.target.md");
  });

  it("keeps fixtures off Vercel-ignored MSW handlers", () => {
    const fixtureSource = readFileSync(
      new URL("./content-editor-file-view.fixture.ts", import.meta.url),
      "utf8",
    );
    expect(fixtureSource).not.toMatch(/content-editor-document-msw-handlers/);
  });
});
