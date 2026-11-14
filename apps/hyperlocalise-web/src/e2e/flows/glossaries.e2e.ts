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

describe("glossaries", () => {
  useE2eBrowser();

  it("creates a glossary and opens it from the list", async () => {
    const page = getE2ePage();
    const identity = await loginAsAdmin(page);
    const glossaryName = `E2E Glossary ${Date.now()}`;
    const glossariesPath = organizationPath(identity.organizationSlug, "/glossaries");

    await openPageWithHeading(page, glossariesPath, "Glossaries");
    const dialog = await openDialog(
      page,
      page.getByRole("button", { name: "Create glossary" }).first(),
      "Create glossary",
    );
    await dialog.getByPlaceholder("Product terminology").fill(glossaryName);
    await dialog.getByRole("button", { name: "Create glossary" }).click();
    await dialog.waitFor({ state: "hidden", timeout: 30_000 });

    await openPageWithHeading(page, glossariesPath, "Glossaries");
    await page.getByText(glossaryName).first().click();
    await page.waitForURL((url) => /\/glossaries\/[^/]+$/.test(url.pathname), {
      timeout: 30_000,
    });
    await page
      .getByRole("heading", { name: glossaryName })
      .waitFor({ state: "visible", timeout: 30_000 });
  }, 180_000);
});
