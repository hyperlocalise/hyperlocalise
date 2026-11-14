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
import {
  getE2ePage,
  loginAsAdmin,
  openDialog,
  openPageWithHeading,
  useE2eBrowser,
} from "../fixtures/browser";

const API_KEY_PREFIX = "hl_";

describe("API keys", () => {
  useE2eBrowser();

  it("shows a new key once, lists it, then revokes it", async () => {
    const page = getE2ePage();
    const identity = await loginAsAdmin(page);
    const keyName = `E2E key ${Date.now()}`;
    const apiKeysPath = organizationPath(identity.organizationSlug, "/settings/api-keys");

    await openPageWithHeading(page, apiKeysPath, "API keys");
    const createDialog = await openDialog(
      page,
      page.getByRole("button", { name: "Create API key" }),
      "Create API key",
    );
    await createDialog.getByLabel("Key name").fill(keyName);
    await createDialog.getByRole("button", { name: "Create key" }).click();

    const createdDialog = page.getByRole("dialog", { name: "API key created" });
    await createdDialog.waitFor({ state: "visible", timeout: 30_000 });
    const secret = await createdDialog.locator("input").first().inputValue();
    expect(secret.startsWith(API_KEY_PREFIX)).toBe(true);
    await createdDialog.getByRole("button", { name: "Done" }).click();
    await createdDialog.waitFor({ state: "hidden" });

    const row = page.getByRole("row").filter({ hasText: keyName });
    await row.waitFor({ state: "visible", timeout: 30_000 });
    expect(await page.locator("body").innerText()).not.toContain(secret);

    await page.reload({ waitUntil: "domcontentloaded" });
    await row.waitFor({ state: "visible", timeout: 30_000 });

    const confirm = await openDialog(
      page,
      row.getByRole("button", { name: "Revoke" }),
      "Revoke API key",
    );
    await confirm.getByRole("button", { name: "Revoke key" }).click();
    await row.waitFor({ state: "hidden", timeout: 30_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Create API key" })
      .waitFor({ state: "visible", timeout: 30_000 });
    expect(await row.count()).toBe(0);
  }, 180_000);
});
