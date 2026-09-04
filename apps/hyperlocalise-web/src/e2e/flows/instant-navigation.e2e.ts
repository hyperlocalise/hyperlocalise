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
import { instant } from "@next/playwright";
import { describe, it } from "vite-plus/test";

import { E2E_BASE_URL, organizationDashboardPath } from "../constants";
import { getE2ePage, loginAsAdmin, useE2eBrowser } from "../fixtures/browser";

describe("instant navigation", () => {
  useE2eBrowser();

  it("dashboard is instant on an initial page load", async () => {
    const page = getE2ePage();
    const identity = await loginAsAdmin(page);
    const dashboardPath = organizationDashboardPath(identity.organizationSlug);

    await instant(
      page,
      async () => {
        await page.goto(new URL(dashboardPath, E2E_BASE_URL).toString(), {
          waitUntil: "domcontentloaded",
        });
        await page.getByRole("heading", { name: "Overview" }).waitFor({ state: "visible" });
      },
      { baseURL: E2E_BASE_URL },
    );
  });

  it("projects nav is instant on a client navigation", async () => {
    const page = getE2ePage();
    await loginAsAdmin(page);

    await instant(page, async () => {
      await page.getByRole("link", { name: "Projects", exact: true }).click();
      await page.waitForURL((url) => url.pathname.endsWith("/projects"));
      await page.getByRole("heading", { name: "Projects" }).waitFor({ state: "visible" });
    });
  });

  it("jobs nav is instant on a client navigation", async () => {
    const page = getE2ePage();
    await loginAsAdmin(page);

    await instant(page, async () => {
      await page.getByRole("link", { name: "Jobs", exact: true }).click();
      await page.waitForURL((url) => url.pathname.endsWith("/jobs"));
      await page.getByRole("heading", { name: "Jobs" }).waitFor({ state: "visible" });
    });
  });
});
