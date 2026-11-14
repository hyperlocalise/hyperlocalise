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

/**
 * Reports sits behind the `workspace-reports` flag, which the WorkOS emulator does not serve, and
 * reads from go-svc. Run these against an environment with the flag on for the e2e workspace and
 * go-svc reachable at NEXT_PUBLIC_API_BASE_URL: `E2E_REPORTS_ENABLED=1 vp run test:e2e`.
 */
const reportsEnabled = process.env.E2E_REPORTS_ENABLED === "1";

describe.skipIf(!reportsEnabled)("reports", () => {
  useE2eBrowser();

  it("shows an admin every tab, the Contributors report and its CSV", async () => {
    const page = getE2ePage();
    const identity = await loginWithRole(page, "admin");
    await page.goto(e2eUrl(organizationPath(identity.organizationSlug, "/reports")), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const tabs = page.getByRole("tab");
    await tabs.first().waitFor({ state: "visible", timeout: 60_000 });
    expect(await tabs.allTextContents()).toEqual([
      "Activity",
      "Word counts",
      "Contributors",
      "Time",
      "AI usage",
      "Costs",
      "Cost estimate",
      "Budgets",
    ]);

    await page.getByRole("tab", { name: "Contributors" }).click();
    await page.waitForURL((url) => url.searchParams.get("tab") === "contributors");
    await waitForSettledPage(page);
    // A new workspace has no work yet: the empty state, or the table once it has some.
    await page
      .getByText("No one finished strings or logged time in these dates.")
      .or(page.getByRole("table", { name: "Work by person" }))
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });

    const download = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: "Download CSV" }).click();
    expect((await download).suggestedFilename()).toBe("contributors.csv");
  }, 240_000);

  it("shows a translator only their own time and work", async () => {
    const page = getE2ePage();
    await page.context().clearCookies();
    const identity = await loginWithRole(page, "translator");
    await page.goto(e2eUrl(organizationPath(identity.organizationSlug, "/reports?tab=costs")), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const tabs = page.getByRole("tab");
    await tabs.first().waitFor({ state: "visible", timeout: 60_000 });
    expect(await tabs.allTextContents()).toEqual(["Time", "Contributors"]);
    await page.getByRole("button", { name: "Log time" }).waitFor({ state: "visible" });

    await page.getByRole("tab", { name: "Contributors" }).click();
    await page.getByText("You see only your own work.").waitFor({ state: "visible" });
    expect(await page.getByText("Paid for people's work").count()).toBe(0);
  }, 240_000);
});
