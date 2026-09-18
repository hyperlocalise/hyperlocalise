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
import { describe, it } from "vite-plus/test";

import { E2E_DEFAULT_LOCALE, e2eUrl } from "../constants";
import { getE2ePage, loginAsAdmin, useE2eBrowser } from "../fixtures/browser";

describe("sign out", () => {
  useE2eBrowser();

  it("clears the session from the account menu and returns to sign-in", async () => {
    const page = getE2ePage();
    await loginAsAdmin(page);

    await page.getByRole("button", { name: /Open account menu/i }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();

    await page
      .getByRole("heading", {
        name: "AI-native infrastructure for multilingual content operations",
      })
      .waitFor({ state: "visible", timeout: 30_000 });

    await page.goto(e2eUrl(`/${E2E_DEFAULT_LOCALE}/dashboard`), {
      waitUntil: "domcontentloaded",
    });
    await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 30_000 });
  });
});
