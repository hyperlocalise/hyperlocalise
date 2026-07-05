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
    await sharedContext?.browser.close();
    sharedContext = null;
  });
}

export function getE2ePage() {
  if (!sharedContext) {
    throw new Error("E2E browser is not initialized");
  }

  return sharedContext.page;
}

export async function loginAsAdmin(page: Page) {
  const loginUrl = new URL("/e2e/login", E2E_BASE_URL);
  loginUrl.searchParams.set("role", "admin");
  await page.goto(loginUrl.toString(), { waitUntil: "networkidle" });
}
