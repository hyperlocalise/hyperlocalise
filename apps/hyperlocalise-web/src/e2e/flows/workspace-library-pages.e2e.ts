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
import { getE2ePage, loginAsAdmin, openPageWithHeading, useE2eBrowser } from "../fixtures/browser";

type WorkspacePage = {
  path: string;
  heading: string;
  action?: string;
};

const LIBRARY_PAGES: WorkspacePage[] = [
  { path: "/glossaries", heading: "Glossaries", action: "Create glossary" },
  { path: "/translation-memories", heading: "Translation Memories", action: "Create memory" },
  { path: "/dictionaries", heading: "Dictionaries", action: "Create dictionary" },
  { path: "/knowledge", heading: "Guideline" },
  { path: "/issues", heading: "Queries", action: "Issue" },
  { path: "/my-jobs", heading: "My Jobs" },
  { path: "/qa", heading: "Translation QA" },
  { path: "/reports", heading: "Reports" },
  { path: "/automations", heading: "Automations" },
];

const SETTINGS_PAGES: WorkspacePage[] = [
  { path: "/settings/webhooks", heading: "Webhooks", action: "Add endpoint" },
  { path: "/settings/activity-logs", heading: "Activity logs" },
  { path: "/settings/project-templates", heading: "Project templates", action: "New template" },
  { path: "/members/permissions", heading: "Role permissions" },
];

describe("workspace library pages", () => {
  useE2eBrowser();

  it("opens library, inbox, and remaining settings pages for an admin", async () => {
    const page = getE2ePage();
    const identity = await loginAsAdmin(page);
    const orgPath = (suffix: string) => organizationPath(identity.organizationSlug, suffix);

    for (const { path, heading, action } of [...LIBRARY_PAGES, ...SETTINGS_PAGES]) {
      await openPageWithHeading(page, orgPath(path), heading);
      if (action) {
        await page
          .getByRole("button", { name: action, exact: true })
          .first()
          .waitFor({ state: "visible", timeout: 30_000 });
      }
    }

    await page.goto(e2eUrl(orgPath("/my-work")), { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname.endsWith("/my-jobs"), { timeout: 30_000 });

    await page.goto(e2eUrl(orgPath("/inbox")), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page
      .getByRole("button", { name: "Unread", exact: true })
      .waitFor({ state: "visible", timeout: 30_000 });
  }, 300_000);
});
