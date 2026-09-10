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

export const CAT_STORY_OFFICE_ASSET_PREFIX = "/storybook/cat/";

export const CAT_STORY_OFFICE_DOCX_SOURCE_URL = "/storybook/cat/docs/product-brief.source.docx";
export const CAT_STORY_OFFICE_DOCX_TARGET_URL = "/storybook/cat/docs/product-brief.target.docx";
export const CAT_STORY_OFFICE_XLSX_SOURCE_URL =
  "/storybook/cat/sheets/localization-metrics.source.xlsx";
export const CAT_STORY_OFFICE_XLSX_TARGET_URL =
  "/storybook/cat/sheets/localization-metrics.target.xlsx";
export const CAT_STORY_OFFICE_PPTX_SOURCE_URL = "/storybook/cat/decks/quarterly-review.source.pptx";
export const CAT_STORY_OFFICE_PPTX_TARGET_URL = "/storybook/cat/decks/quarterly-review.target.pptx";

export function isCatStoryOfficeAssetUrl(src: string | null | undefined) {
  return Boolean(src?.startsWith(CAT_STORY_OFFICE_ASSET_PREFIX));
}
