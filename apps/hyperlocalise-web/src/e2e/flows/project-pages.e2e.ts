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
import { provisionNativeProjectFixture } from "../helpers/issue-sheet-fixture";

describe("project pages", () => {
  useE2eBrowser();

  it("shows empty overview and files, then creates an issue from Queries", async () => {
    const page = getE2ePage();
    const identity = await loginAsAdmin(page);
    const fixture = await provisionNativeProjectFixture(identity);
    const projectPath = (suffix: string) =>
      organizationPath(fixture.organizationSlug, `/projects/${fixture.projectId}${suffix}`);

    await page.goto(e2eUrl(projectPath("")), { waitUntil: "domcontentloaded" });
    await page.getByText(fixture.projectName).waitFor({ state: "visible", timeout: 30_000 });
    await page.getByText("No jobs yet").waitFor({ state: "visible" });

    await page.goto(e2eUrl(projectPath("/files")), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Add files" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.getByText("No files yet").waitFor({ state: "visible" });

    const issueTitle = `E2E issue ${Date.now()}`;
    await page.goto(e2eUrl(projectPath("/issue-sheet")), { waitUntil: "domcontentloaded" });
    await page.getByText("Queries").waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("button", { name: "Issue" }).click();
    await page.getByRole("heading", { name: "New issue" }).waitFor({ state: "visible" });
    await page.getByLabel("Title").fill(issueTitle);

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/issue-sheet") &&
        response.request().method() === "POST" &&
        response.ok(),
    );
    await page.getByRole("button", { name: "Create issue" }).click();
    await createResponsePromise;

    await page.getByText(issueTitle).waitFor({ state: "visible", timeout: 30_000 });
  }, 120_000);
});
