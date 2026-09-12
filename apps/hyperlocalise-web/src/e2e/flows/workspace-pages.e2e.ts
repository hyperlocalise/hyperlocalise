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

import { e2eUrl, organizationPath } from "../constants";
import { getE2ePage, loginAsAdmin, useE2eBrowser } from "../fixtures/browser";

describe("workspace pages", () => {
  useE2eBrowser();

  it("opens members, jobs, settings, and teams without third-party APIs", async () => {
    const page = getE2ePage();
    const identity = await loginAsAdmin(page);
    const orgPath = (suffix: string) => organizationPath(identity.organizationSlug, suffix);

    await page.goto(e2eUrl(orgPath("/members")), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Members" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("button", { name: "Invite member" }).waitFor({ state: "visible" });
    await page.getByText("You", { exact: true }).waitFor({ state: "visible" });

    await page.goto(e2eUrl(orgPath("/jobs")), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Jobs" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.getByText("No Hyperlocalise jobs found for this workspace.").waitFor({
      state: "visible",
    });

    await page.goto(e2eUrl(orgPath("/settings")), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "General" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.getByLabel("Organization name").waitFor({ state: "visible" });

    await page.goto(e2eUrl(orgPath("/settings/account")), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Account" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.getByDisplayValue(identity.email).waitFor({ state: "visible" });

    await page.goto(e2eUrl(orgPath("/teams")), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Teams" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("button", { name: "Create team" }).waitFor({ state: "visible" });
    await page.getByText("No teams yet").waitFor({ state: "visible" });
  });
});
