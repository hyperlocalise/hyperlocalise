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

import { BRAZE_CONTENT_BLOCK_NAME_MAX_LENGTH } from "./constants";

export function slugifyBrazePathSegment(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback.trim() || "item";
}

export function brazeEmailCopyName(sourceName: string, localeSuffix: string): string {
  const base = sourceName.trim() || "Template";
  return `${base}_${localeSuffix}`;
}

/** Content Block names: A-Z, a-z, 0-9, dash, underscore. Max 100 chars. */
export function sanitizeBrazeContentBlockName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, BRAZE_CONTENT_BLOCK_NAME_MAX_LENGTH);
  return sanitized || "content_block";
}

export function brazeContentBlockCopyName(sourceName: string, localeSuffix: string): string {
  const suffix = `_${localeSuffix.trim() || "locale"}`;
  const maxBaseLength = Math.max(1, BRAZE_CONTENT_BLOCK_NAME_MAX_LENGTH - suffix.length);
  const base = sanitizeBrazeContentBlockName(sourceName)
    .slice(0, maxBaseLength)
    .replace(/_+$/g, "");
  return `${base || "content_block"}${suffix}`.slice(0, BRAZE_CONTENT_BLOCK_NAME_MAX_LENGTH);
}
