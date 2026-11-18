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
import { getE2ePage, loginWithRole, useE2eBrowser, waitForSettledPage } from "../fixtures/browser";

// Pages a vendor must never see. Each sends them back to My jobs.
const CLOSED_PAGES = [
  "/dashboard",
  "/projects",
  "/jobs",
  "/members",
  "/teams",
  "/glossaries",
  "/memories",
  "/reports",
  "/issues",
  "/inbox",
  "/settings",
  "/settings/account",
  "/settings/api-keys",
  "/settings/billing",
  "/settings/project-templates",
];

describe("the Vendor role", () => {
  useE2eBrowser();

  it("lands on My jobs, has nothing else in the navigation, and is sent back from closed pages", async () => {
    const page = getE2ePage();
    const identity = await loginWithRole(page, "vendor");
    const isMyJobs = (url: URL) =>
      url.pathname.endsWith(`/org/${identity.organizationSlug}/my-jobs`);

    await page.waitForURL(isMyJobs, { timeout: 30_000 });
    await page.getByText("Assigned to me").first().waitFor({ state: "visible", timeout: 30_000 });
    await waitForSettledPage(page);

    // Only the Assigned list, and only one place to go.
    expect(await page.getByText("Created by me").count()).toBe(0);
    const links = await page
      .locator('[data-slot="sidebar"] a[href]')
      .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href") ?? ""));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(href).toContain("/my-jobs");
    }
    for (const label of ["Projects", "Dashboard", "Glossaries", "Reports", "Settings", "Inbox"]) {
      expect(await page.getByRole("link", { name: label, exact: true }).count(), label).toBe(0);
    }

    for (const suffix of CLOSED_PAGES) {
      await page.goto(e2eUrl(organizationPath(identity.organizationSlug, suffix)), {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForURL(isMyJobs, { timeout: 30_000 });
    }
  }, 240_000);
});
