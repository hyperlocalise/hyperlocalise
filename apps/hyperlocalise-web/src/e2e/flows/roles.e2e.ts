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

import { e2eUrl, organizationPath } from "../constants";
import {
  getE2ePage,
  loginWithRole,
  openPageWithHeading,
  useE2eBrowser,
  waitForSettledPage,
} from "../fixtures/browser";

const ADMIN_ONLY_SETTINGS = [
  "/settings/api-keys",
  "/settings/billing",
  "/settings/webhooks",
  "/settings/activity-logs",
];

describe("role-based access", () => {
  useE2eBrowser();

  it("keeps a translator out of admin settings and hides admin actions", async () => {
    const page = getE2ePage();
    const identity = await loginWithRole(page, "translator");
    const orgPath = (suffix: string) => organizationPath(identity.organizationSlug, suffix);

    for (const suffix of ADMIN_ONLY_SETTINGS) {
      await page.goto(e2eUrl(orgPath(suffix)), { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForURL((url) => url.pathname === "/auth/access-denied", { timeout: 30_000 });
      await page
        .locator('[data-slot="card-title"]')
        .filter({ hasText: "Insufficient permissions" })
        .waitFor({ state: "visible", timeout: 30_000 });
    }

    await openPageWithHeading(page, orgPath("/members"), "Members");
    await page.getByText("You", { exact: true }).waitFor({ state: "visible" });
    await waitForSettledPage(page);
    expect(await page.getByRole("button", { name: "Invite member" }).count()).toBe(0);

    await openPageWithHeading(page, orgPath("/glossaries"), "Glossaries");
    await waitForSettledPage(page);
    expect(await page.getByRole("button", { name: "Create glossary" }).count()).toBe(0);
  }, 180_000);

  it("lets a localization manager open workspace settings", async () => {
    const page = getE2ePage();
    await page.context().clearCookies();
    const identity = await loginWithRole(page, "localization_manager");
    const orgPath = (suffix: string) => organizationPath(identity.organizationSlug, suffix);

    await openPageWithHeading(page, orgPath("/members"), "Members");
    await page.getByRole("button", { name: "Invite member" }).waitFor({ state: "visible" });

    await openPageWithHeading(page, orgPath("/glossaries"), "Glossaries");
    await page.getByRole("button", { name: "Create glossary" }).first().waitFor({
      state: "visible",
    });
  }, 180_000);
});
