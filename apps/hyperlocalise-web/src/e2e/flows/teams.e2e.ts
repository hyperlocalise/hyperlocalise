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

import { organizationPath } from "../constants";
import {
  getE2ePage,
  loginAsAdmin,
  openDialog,
  openPageWithHeading,
  useE2eBrowser,
} from "../fixtures/browser";

describe("teams", () => {
  useE2eBrowser();

  it("creates a team and opens its detail page", async () => {
    const page = getE2ePage();
    const identity = await loginAsAdmin(page);
    const teamName = `E2E Team ${Date.now()}`;

    await openPageWithHeading(page, organizationPath(identity.organizationSlug, "/teams"), "Teams");
    const dialog = await openDialog(
      page,
      page.getByRole("button", { name: "Create team" }),
      "Create team",
    );
    await dialog.getByLabel("Name", { exact: true }).fill(teamName);
    await dialog.getByRole("button", { name: "Create team" }).click();
    await dialog.waitFor({ state: "hidden", timeout: 30_000 });

    await page.getByText(teamName).first().click();
    await page.waitForURL((url) => /\/teams\/[^/]+$/.test(url.pathname), { timeout: 30_000 });
    await page
      .getByRole("heading", { name: teamName })
      .waitFor({ state: "visible", timeout: 30_000 });
  }, 180_000);
});
