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

import { organizationPath } from "../constants";
import { getE2ePage, loginAsAdmin, openPageWithHeading, useE2eBrowser } from "../fixtures/browser";
import { provisionNativeProjectFixture } from "../helpers/issue-sheet-fixture";

type ProjectPage = {
  path: string;
  heading: string;
  action?: string;
};

const PROJECT_PAGES: ProjectPage[] = [
  { path: "/strings", heading: "Queue" },
  { path: "/jobs", heading: "Jobs", action: "Create job" },
  { path: "/branches", heading: "Branches", action: "Create branch" },
  { path: "/qa", heading: "Translation QA", action: "Run QA check" },
  { path: "/reports", heading: "Reports" },
  { path: "/knowledge", heading: "Guideline" },
  { path: "/automations", heading: "Automations" },
];

describe("project sub-pages", () => {
  useE2eBrowser();

  it("opens strings, jobs, branches, QA, reports, guideline, and automations", async () => {
    const page = getE2ePage();
    const identity = await loginAsAdmin(page);
    const fixture = await provisionNativeProjectFixture(identity);
    const projectPath = (suffix: string) =>
      organizationPath(fixture.organizationSlug, `/projects/${fixture.projectId}${suffix}`);

    for (const { path, heading, action } of PROJECT_PAGES) {
      await openPageWithHeading(page, projectPath(path), heading);
      if (action) {
        await page
          .getByRole("button", { name: action, exact: true })
          .first()
          .waitFor({ state: "visible", timeout: 30_000 });
      }
    }
  }, 300_000);

  it("saves the project description and keeps it after reload", async () => {
    const page = getE2ePage();
    await page.context().clearCookies();
    const identity = await loginAsAdmin(page);
    const fixture = await provisionNativeProjectFixture(identity);
    const settingsPath = organizationPath(
      fixture.organizationSlug,
      `/projects/${fixture.projectId}/settings`,
    );
    const description = `E2E description ${Date.now()}`;

    await openPageWithHeading(page, settingsPath, "General");
    const saveButton = page.getByRole("button", { name: "Save general settings" });
    await saveButton.waitFor({ state: "visible", timeout: 30_000 });
    await page.getByLabel("Description", { exact: true }).fill(description);
    await expect.poll(() => saveButton.isEnabled(), { timeout: 10_000 }).toBe(true);

    const saveResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/projects/${fixture.projectId}`) &&
        ["PATCH", "PUT"].includes(response.request().method()),
    );
    await saveButton.click();
    expect((await saveResponsePromise).ok()).toBe(true);
    // The leave guard blocks reload until the saved values become the new baseline.
    await expect.poll(() => saveButton.isEnabled(), { timeout: 30_000 }).toBe(false);

    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page
      .getByRole("heading", { name: "General", exact: true })
      .waitFor({ state: "visible", timeout: 30_000 });
    await expect
      .poll(() => page.getByLabel("Description", { exact: true }).inputValue(), {
        timeout: 30_000,
      })
      .toBe(description);
  }, 180_000);
});
