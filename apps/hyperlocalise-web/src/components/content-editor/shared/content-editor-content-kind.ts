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
import type { ContentEditorContentKind } from "./types";

const ASSET_CONTENT_KINDS = new Set<ContentEditorContentKind>([
  "image_file",
  "image_url",
  "video_file",
  "video_url",
]);

export function isContentEditorAssetContentKind(
  contentKind: ContentEditorContentKind | undefined,
): boolean {
  return contentKind != null && ASSET_CONTENT_KINDS.has(contentKind);
}
