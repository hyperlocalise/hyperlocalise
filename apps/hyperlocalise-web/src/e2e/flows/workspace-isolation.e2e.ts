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
import {
  getE2ePage,
  loginAsIdentity,
  openPageWithHeading,
  provisionWorkspaceIdentity,
  useE2eBrowser,
  waitForSettledPage,
} from "../fixtures/browser";
import { addEmulatorMembership } from "../helpers/emulator-identity";
import { provisionNativeProjectFixture } from "../helpers/issue-sheet-fixture";

describe("workspace isolation", () => {
  useE2eBrowser();

  it("does not show another workspace's data to a non-member", async () => {
    const page = getE2ePage();
    const other = await provisionWorkspaceIdentity();
    // The project fixture needs the owner's local user row, which first sign-in creates.
    await loginAsIdentity(page, other);
    const otherProject = await provisionNativeProjectFixture(other, "Isolated E2E");
    await page.context().clearCookies();

    const identity = await provisionWorkspaceIdentity();
    await loginAsIdentity(page, identity);

    const otherPaths = [
      organizationPath(other.organizationSlug, "/dashboard"),
      organizationPath(other.organizationSlug, `/projects/${otherProject.projectId}`),
      organizationPath(identity.organizationSlug, `/projects/${otherProject.projectId}`),
    ];
    for (const path of otherPaths) {
      await page.goto(e2eUrl(path), { waitUntil: "domcontentloaded", timeout: 60_000 });
      await waitForSettledPage(page);
      const body = await page.locator("body").innerText();
      expect(body).not.toContain(other.organizationName);
      expect(body).not.toContain(otherProject.projectName);
    }
  }, 240_000);

  it("switches to a second workspace with that workspace's role", async () => {
    const page = getE2ePage();
    await page.context().clearCookies();
    const second = await provisionWorkspaceIdentity();
    const identity = await provisionWorkspaceIdentity();
    await loginAsIdentity(page, identity);
    await addEmulatorMembership({ user: identity, organization: second, role: "translator" });

    await page.goto(e2eUrl("/auth/select-organization"), { waitUntil: "domcontentloaded" });
    await page
      .locator('[data-slot="card-title"]')
      .filter({ hasText: "Choose a workspace" })
      .waitFor({ state: "visible", timeout: 30_000 });
    const workspaceLink = (slug: string) =>
      page.locator(`a[href^="/auth/select-organization/${slug}?"]`);
    await workspaceLink(identity.organizationSlug).waitFor({ state: "visible" });
    await workspaceLink(second.organizationSlug).click();

    await page.waitForURL(
      (url) => url.pathname.includes(`/org/${second.organizationSlug}/dashboard`),
      { timeout: 60_000 },
    );
    await page.getByRole("heading", { name: "Overview" }).waitFor({ state: "visible" });

    await page.goto(e2eUrl(organizationPath(second.organizationSlug, "/settings/api-keys")), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForURL((url) => url.pathname === "/auth/access-denied", { timeout: 30_000 });

    await openPageWithHeading(
      page,
      organizationPath(identity.organizationSlug, "/settings/api-keys"),
      "API keys",
    );
  }, 240_000);
});
