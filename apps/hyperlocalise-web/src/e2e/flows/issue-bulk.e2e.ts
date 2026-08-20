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

import { E2E_BASE_URL, E2E_DEFAULT_LOCALE } from "../constants";
import { getE2ePage, loginAsAdmin, useE2eBrowser } from "../fixtures/browser";
import { provisionIssueSheetBulkFixture } from "../helpers/issue-sheet-fixture";

describe("issue bulk actions", () => {
  useE2eBrowser();

  it("selects loaded issues and bulk sets status from the project issue sheet", async () => {
    const page = getE2ePage();
    const identity = await loginAsAdmin(page);
    const fixture = await provisionIssueSheetBulkFixture(identity);

    const issueSheetUrl = new URL(
      `/${E2E_DEFAULT_LOCALE}/org/${fixture.organizationSlug}/projects/${fixture.projectId}/issue-sheet`,
      E2E_BASE_URL,
    ).toString();

    await page.goto(issueSheetUrl, { waitUntil: "domcontentloaded" });
    await page.getByText(fixture.issueTitles[0]).waitFor({ state: "visible", timeout: 30_000 });
    await page.getByText(fixture.issueTitles[1]).waitFor({ state: "visible", timeout: 30_000 });

    const rowCheckboxes = page.getByRole("checkbox", { name: /Select issue/i });
    await rowCheckboxes.nth(0).check();
    await rowCheckboxes.nth(1).check();

    await page.getByText(/2 issues selected/i).waitFor({ state: "visible" });

    const bulkBar = page.locator('[aria-live="polite"]').filter({ hasText: /issues selected/i });
    const bulkResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/issues/bulk-actions") && response.request().method() === "POST",
    );
    await bulkBar.locator('button[aria-haspopup="menu"]').filter({ hasText: "Status" }).click();
    await page.getByRole("menuitem", { name: "In progress" }).waitFor({ state: "visible" });
    await page.getByRole("menuitem", { name: "In progress" }).click();

    const bulkResponse = await bulkResponsePromise;
    if (!bulkResponse.ok()) {
      throw new Error(
        `Bulk status update failed (${bulkResponse.status()}): ${await bulkResponse.text()}`,
      );
    }

    await page.getByText(/2 issues selected/i).waitFor({ state: "hidden", timeout: 30_000 });
    await page.getByText(fixture.issueTitles[0]).waitFor({ state: "visible" });
    await page.getByText(fixture.issueTitles[1]).waitFor({ state: "visible" });
  }, 120_000);
});
