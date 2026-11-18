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

// Pages a vendor must never see: every section of a workspace but My jobs. Each sends them
// back to My jobs.
const CLOSED_PAGES = [
  "/dashboard",
  "/projects",
  "/jobs",
  "/members",
  "/teams",
  "/glossaries",
  "/translation-memories",
  "/dictionaries",
  "/knowledge",
  "/reports",
  "/issues",
  "/inbox",
  "/chat",
  "/automations",
  "/integrations",
  "/ai-engine",
  "/qa",
  "/domains",
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
      const url = e2eUrl(organizationPath(identity.organizationSlug, suffix));

      // The server itself refuses, before any script runs: its answer is a redirect, either as
      // the response or, once the page has begun streaming, as the redirect tag Next.js writes.
      // The frame's own guard in the browser would hide a page the server still sent.
      const response = await page.request.get(url, { maxRedirects: 0 });
      const redirected =
        response.status() >= 300 && response.status() < 400
          ? (response.headers().location ?? "")
          : (/id="__next-page-redirect"[^>]*url=([^"]+)"/.exec(await response.text())?.[1] ?? "");
      expect(redirected, suffix).toContain(`/org/${identity.organizationSlug}/my-jobs`);

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForURL(isMyJobs, { timeout: 30_000 });
    }
  }, 240_000);
});
