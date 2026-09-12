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
import { getE2ePage, useE2eBrowser } from "../fixtures/browser";

describe("auth guards", () => {
  useE2eBrowser();

  it("sends unauthenticated dashboard visits to the sign-in form", async () => {
    const page = getE2ePage();
    await page.goto(e2eUrl(`/${E2E_DEFAULT_LOCALE}/dashboard`), {
      waitUntil: "domcontentloaded",
    });

    await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 30_000 });
  });

  it("renders the public access denied page", async () => {
    const page = getE2ePage();
    await page.goto(e2eUrl("/auth/access-denied"), { waitUntil: "domcontentloaded" });

    await page
      .getByRole("heading", { name: "Access denied" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("link", { name: "Choose organization" }).waitFor({ state: "visible" });
    await page.getByRole("link", { name: "Sign out" }).waitFor({ state: "visible" });
    await page.getByRole("link", { name: "Back to site" }).waitFor({ state: "visible" });
  });
});
