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

describe("marketing pages", () => {
  useE2eBrowser();

  it("renders the homepage hero without sign-in", async () => {
    const page = getE2ePage();
    await page.goto(e2eUrl(`/${E2E_DEFAULT_LOCALE}`), { waitUntil: "domcontentloaded" });

    await page
      .getByRole("heading", {
        name: "AI-native infrastructure for multilingual content operations",
      })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("link", { name: /Explore the platform/i }).waitFor({ state: "visible" });
  });

  it("renders pricing, legal, and contact pages from local copy", async () => {
    const page = getE2ePage();

    await page.goto(e2eUrl(`/${E2E_DEFAULT_LOCALE}/pricing`), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Scale localisation. Control your costs." })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("heading", { name: "Compare plans" }).waitFor({ state: "visible" });

    await page.goto(e2eUrl(`/${E2E_DEFAULT_LOCALE}/privacy`), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Privacy policy" })
      .waitFor({ state: "visible", timeout: 30_000 });

    await page.goto(e2eUrl(`/${E2E_DEFAULT_LOCALE}/terms`), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Terms of service" })
      .waitFor({ state: "visible", timeout: 30_000 });

    await page.goto(e2eUrl(`/${E2E_DEFAULT_LOCALE}/contact`), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Talk with the Hyperlocalise team" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("link", { name: "Email support" }).waitFor({ state: "visible" });
  });
});
