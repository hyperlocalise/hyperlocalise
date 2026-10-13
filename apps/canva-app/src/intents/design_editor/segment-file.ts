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

export function normalizeSegmentText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function buildSourcePath(designId: string): string {
  return `canva/designs/${designId}.json`;
}

export function pageFileNumber(pageIndex: number): number {
  return pageIndex + 1;
}

export function buildPageFileName(pageIndex: number): string {
  return `page-${pageFileNumber(pageIndex)}.json`;
}

function canvaPathSegment(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

export function buildPageSourcePath(
  designSlug: string,
  designId: string,
  pageIndex: number,
): string {
  return `canva/designs/${designSlug}-${canvaPathSegment(designId)}/${buildPageFileName(pageIndex)}`;
}
