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
import { describe, it } from "vite-plus/test";

import { getE2ePage, loginAsAdmin, useE2eBrowser } from "../fixtures/browser";

describe("fixture auth", () => {
  useE2eBrowser();

  it("creates a session and opens the organization dashboard", async () => {
    const page = getE2ePage();
    await loginAsAdmin(page);
    await page.getByRole("heading", { name: "Overview" }).waitFor({ state: "visible" });
  });
});
