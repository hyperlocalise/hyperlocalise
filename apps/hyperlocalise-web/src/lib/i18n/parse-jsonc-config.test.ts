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

import { normalizeJsonc } from "./parse-jsonc-config";

describe("normalizeJsonc", () => {
  it("strips comments and trailing commas", () => {
    const normalized = normalizeJsonc(`{
      // comment
      "locales": { "source": "en", "targets": ["es",], },
    }`);

    expect(JSON.parse(normalized)).toEqual({
      locales: { source: "en", targets: ["es"] },
    });
  });
});
