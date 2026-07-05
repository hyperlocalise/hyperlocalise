import { describe, it } from "vite-plus/test";

import { getE2ePage, loginAsAdmin, useE2eBrowser } from "../fixtures/browser";

describe("fixture auth", () => {
  useE2eBrowser();

  it("creates a session and opens the organization dashboard", async () => {
    const page = getE2ePage();
    await loginAsAdmin(page);
    await page.getByRole("heading", { name: "Overview" }).waitFor({ state: "visible" });
  });
});
