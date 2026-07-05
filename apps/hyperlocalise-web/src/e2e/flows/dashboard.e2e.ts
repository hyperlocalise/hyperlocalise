import { describe, it } from "vite-plus/test";

import { getE2ePage, loginAsAdmin, useE2eBrowser } from "../fixtures/browser";

describe("dashboard", () => {
  useE2eBrowser();

  it("shows workspace overview panels for a signed-in admin", async () => {
    const page = getE2ePage();
    await loginAsAdmin(page);

    await page.getByRole("heading", { name: "Overview" }).waitFor({ state: "visible" });
    await page
      .locator('[data-slot="card-title"]')
      .filter({ hasText: "My jobs" })
      .waitFor({ state: "visible" });
    await page
      .locator('[data-slot="card-title"]')
      .filter({ hasText: "Recent projects" })
      .waitFor({ state: "visible" });
  });
});
