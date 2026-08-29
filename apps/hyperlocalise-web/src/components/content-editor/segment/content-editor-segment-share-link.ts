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
export const contentEditorSegmentShareParam = "segment";

export function buildCatSegmentShareUrl(input: {
  baseUrl: string;
  segmentId: string;
  segmentKey?: string;
}) {
  const url = new URL(input.baseUrl);
  url.searchParams.set(contentEditorSegmentShareParam, input.segmentKey ?? input.segmentId);
  return url.toString();
}

export function readCatSegmentShareParam(searchParams: URLSearchParams) {
  const value = searchParams.get(contentEditorSegmentShareParam)?.trim();
  return value || null;
}
