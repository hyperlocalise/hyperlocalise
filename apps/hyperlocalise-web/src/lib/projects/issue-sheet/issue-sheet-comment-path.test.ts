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

import { commentPathFromParent, commentPathSegment } from "./issue-sheet-comment-path";

describe("issue sheet comment path segments", () => {
  it("pads timestamps so lexicographic order matches creation order", () => {
    const earlier = new Date("2026-01-01T00:00:00.000Z");
    const later = new Date("2026-01-01T00:00:01.000Z");
    const earlierId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const laterId = "00000000-0000-4000-8000-000000000000";

    const earlierSegment = commentPathSegment(earlier, earlierId);
    const laterSegment = commentPathSegment(later, laterId);

    expect(earlierSegment < laterSegment).toBe(true);
    expect(earlierSegment).toBe(
      `${(BigInt(earlier.getTime()) * BigInt(1000)).toString().padStart(20, "0")}_${earlierId}`,
    );
    expect(commentPathFromParent(null, earlierSegment)).toBe(earlierSegment);
    expect(commentPathFromParent(earlierSegment, laterSegment)).toBe(
      `${earlierSegment}.${laterSegment}`,
    );
  });

  it("accepts microsecond-epoch strings for sub-ms ordering", () => {
    const earlier = commentPathSegment("1767225600000001", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const later = commentPathSegment("1767225600000002", "00000000-0000-4000-8000-000000000000");
    expect(earlier < later).toBe(true);
  });
});
