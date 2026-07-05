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
