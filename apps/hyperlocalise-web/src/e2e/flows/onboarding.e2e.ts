/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, it } from "vite-plus/test";

import { getE2ePage, loginForOnboarding, useE2eBrowser } from "../fixtures/browser";

describe("onboarding", () => {
  useE2eBrowser();

  it("creates a workspace and lands on the organization dashboard", async () => {
    const page = getE2ePage();
    const workspaceName = `E2E Workspace ${Date.now()}`;

    await loginForOnboarding(page);
    await page
      .getByRole("heading", { name: "Create your workspace" })
      .waitFor({ state: "visible" });

    await page.getByLabel("Workspace name").fill(workspaceName);
    await page.getByRole("button", { name: "Create workspace" }).click();

    await page.getByRole("heading", { name: "Overview" }).waitFor({ state: "visible" });
  });
});
