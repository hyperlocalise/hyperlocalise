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

import { effectiveWorkspaceSyncFilter } from "./workspace-filter-params";

describe("effectiveWorkspaceSyncFilter", () => {
  it("preserves sync filters for local list browsing", () => {
    expect(effectiveWorkspaceSyncFilter("synced", false)).toBe("synced");
    expect(effectiveWorkspaceSyncFilter("error", false)).toBe("error");
  });

  it("ignores sync filters while browsing live TMS resources", () => {
    expect(effectiveWorkspaceSyncFilter("synced", true)).toBe("all");
    expect(effectiveWorkspaceSyncFilter("error", true)).toBe("all");
    expect(effectiveWorkspaceSyncFilter("all", true)).toBe("all");
  });
});
