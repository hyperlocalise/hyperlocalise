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

import { slugifySanityPathSegment } from "./names";

describe("slugifySanityPathSegment", () => {
  it("slugifies titles and falls back to the document id without the drafts prefix", () => {
    expect(slugifySanityPathSegment("Home Page", "page-1")).toBe("home-page");
    expect(slugifySanityPathSegment("  ", "drafts.abc123")).toBe("abc123");
  });

  it("strips punctuation, caps length, and uses doc when nothing remains", () => {
    expect(slugifySanityPathSegment("Hello, World!!!", "id")).toBe("hello-world");
    expect(slugifySanityPathSegment("a".repeat(80), "id")).toHaveLength(64);
    expect(slugifySanityPathSegment("@@@", "!!!")).toBe("doc");
  });
});
