import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll } from "vite-plus/test";

import { E2E_BASE_URL } from "../constants";

type E2eBrowserContext = {
  browser: Browser;
  page: Page;
};

let sharedContext: E2eBrowserContext | null = null;

export function useE2eBrowser() {
  beforeAll(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    sharedContext = { browser, page };
  });

  afterAll(async () => {
    const context = sharedContext;
    sharedContext = null;

    if (!context) {
      return;
    }

    try {
      const response = await context.page.request.delete(
        new URL("/api/e2e/auth/session", E2E_BASE_URL).toString(),
      );
      if (response.status() !== 204) {
        throw new Error(`E2E fixture cleanup failed with status ${response.status()}`);
      }
    } finally {
      await context.browser.close();
    }
  });
}

export function getE2ePage() {
  if (!sharedContext) {
    throw new Error("E2E browser is not initialized");
  }

  return sharedContext.page;
}

export async function loginForOnboarding(page: Page) {
  const loginUrl = new URL("/e2e/login", E2E_BASE_URL);
  loginUrl.searchParams.set("mode", "onboarding");
  await page.goto(loginUrl.toString(), { waitUntil: "domcontentloaded" });
}

export async function loginAsAdmin(page: Page) {
  const loginUrl = new URL("/e2e/login", E2E_BASE_URL);
  loginUrl.searchParams.set("role", "admin");
  await page.goto(loginUrl.toString(), { waitUntil: "domcontentloaded" });
}
