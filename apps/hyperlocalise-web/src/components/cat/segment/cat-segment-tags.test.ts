/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { getSegmentTagKind } from "./cat-segment-tags";

describe("getSegmentTagKind", () => {
  it("classifies segment type tags", () => {
    expect(getSegmentTagKind("icu")).toBe("type");
    expect(getSegmentTagKind("text")).toBe("type");
    expect(getSegmentTagKind("dashboard")).toBe("type");
  });

  it("classifies comment count tags", () => {
    expect(getSegmentTagKind("1 comment")).toBe("comment");
    expect(getSegmentTagKind("2 comments")).toBe("comment");
  });

  it("classifies issue count tags", () => {
    expect(getSegmentTagKind("1 issue")).toBe("issue");
    expect(getSegmentTagKind("3 issues")).toBe("issue");
  });
});
