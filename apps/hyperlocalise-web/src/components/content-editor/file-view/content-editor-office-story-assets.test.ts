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
  CAT_STORY_OFFICE_DOCX_SOURCE_URL,
  CAT_STORY_OFFICE_PPTX_TARGET_URL,
  CAT_STORY_OFFICE_XLSX_SOURCE_URL,
  isCatStoryOfficeAssetUrl,
} from "./content-editor-office-story-assets";

describe("isCatStoryOfficeAssetUrl", () => {
  it("matches Storybook CAT office asset URLs", () => {
    expect(isCatStoryOfficeAssetUrl(CAT_STORY_OFFICE_DOCX_SOURCE_URL)).toBe(true);
    expect(isCatStoryOfficeAssetUrl(CAT_STORY_OFFICE_XLSX_SOURCE_URL)).toBe(true);
    expect(isCatStoryOfficeAssetUrl(CAT_STORY_OFFICE_PPTX_TARGET_URL)).toBe(true);
  });

  it("rejects missing and production asset URLs", () => {
    expect(isCatStoryOfficeAssetUrl(undefined)).toBe(false);
    expect(isCatStoryOfficeAssetUrl(null)).toBe(false);
    expect(isCatStoryOfficeAssetUrl("")).toBe(false);
    expect(isCatStoryOfficeAssetUrl("/files/brief.docx")).toBe(false);
    expect(isCatStoryOfficeAssetUrl("https://cdn.example/storybook/cat/brief.docx")).toBe(false);
  });

  it("keeps the production office viewer off Vercel-ignored MSW handlers", () => {
    const viewerSource = readFileSync(
      new URL("./content-editor-office-file-viewer.tsx", import.meta.url),
      "utf8",
    );
    expect(viewerSource).not.toMatch(/content-editor-office-msw-handlers/);
  });
});
