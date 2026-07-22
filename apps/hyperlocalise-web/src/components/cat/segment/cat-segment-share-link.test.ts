/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  buildCatSegmentShareUrl,
  catSegmentShareParam,
  readCatSegmentShareParam,
} from "./cat-segment-share-link";

describe("cat segment share link", () => {
  it("builds a share URL using the segment key when available", () => {
    const url = buildCatSegmentShareUrl({
      baseUrl: "https://example.com/strings?sourcePath=messages.json&targetLocale=vi",
      segmentId: "seg-42",
      segmentKey: "review.bulk.approve",
    });

    expect(url).toContain(`${catSegmentShareParam}=review.bulk.approve`);
  });

  it("reads the segment share param from search params", () => {
    const params = new URLSearchParams("segment=review.bulk.skip&targetLocale=vi");
    expect(readCatSegmentShareParam(params)).toBe("review.bulk.skip");
  });
});
