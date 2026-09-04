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

import { toCatQueueFilter } from "@/api/routes/mcp/mcp-list-translations";

describe("toCatQueueFilter", () => {
  it("maps approved to the CAT reviewed filter", () => {
    expect(toCatQueueFilter("approved")).toBe("reviewed");
  });

  it("passes through CAT filters and leaves all unset", () => {
    expect(toCatQueueFilter()).toBeUndefined();
    expect(toCatQueueFilter("all")).toBe("all");
    expect(toCatQueueFilter("untranslated")).toBe("untranslated");
    expect(toCatQueueFilter("needs_review")).toBe("needs_review");
    expect(toCatQueueFilter("reviewed")).toBe("reviewed");
    expect(toCatQueueFilter("has_issues")).toBe("has_issues");
  });
});
