import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll } from "vite-plus/test";

import { E2E_BASE_URL } from "../constants";

type E2eBrowserContext = {
  browser: Browser;
  page: Page;
  sessionTokens: Set<string>;
};

let sharedContext: E2eBrowserContext | null = null;

async function trackFixtureSession(page: Page) {
  if (!sharedContext) {
    return;
  }

  const cookies = await page.context().cookies(E2E_BASE_URL);
  const token = cookies.find((cookie) => cookie.name === "wos-session")?.value;
  if (token) {
    sharedContext.sessionTokens.add(token);
  }
}

export function useE2eBrowser() {
  beforeAll(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    sharedContext = { browser, page, sessionTokens: new Set() };
  });

  afterAll(async () => {
    const context = sharedContext;
    sharedContext = null;

    if (!context) {
      return;
    }

    try {
      const cleanupUrl = new URL("/api/e2e/auth/session", E2E_BASE_URL).toString();
      for (const token of context.sessionTokens) {
        const response = await context.page.request.delete(cleanupUrl, {
          headers: { Cookie: `wos-session=${token}` },
        });
        if (response.status() !== 204) {
          throw new Error(`E2E fixture cleanup failed with status ${response.status()}`);
        }
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
  await trackFixtureSession(page);
}

export async function loginAsAdmin(page: Page) {
  const loginUrl = new URL("/e2e/login", E2E_BASE_URL);
  loginUrl.searchParams.set("role", "admin");
  await page.goto(loginUrl.toString(), { waitUntil: "domcontentloaded" });
  await trackFixtureSession(page);
}
