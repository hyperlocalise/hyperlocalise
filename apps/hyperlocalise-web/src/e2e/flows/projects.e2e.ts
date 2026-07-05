import { describe, it } from "vite-plus/test";

import { getE2ePage, loginAsAdmin, useE2eBrowser } from "../fixtures/browser";

describe("projects", () => {
  useE2eBrowser();

  it("creates a native localization project from the projects page", async () => {
    const page = getE2ePage();
    const projectName = `E2E Project ${Date.now()}`;

    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Projects", exact: true }).click();

    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("heading", { name: "Create project" }).waitFor({ state: "visible" });

    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Save project" }).click();

    await page.getByText(projectName).waitFor({ state: "visible" });
  });
});
