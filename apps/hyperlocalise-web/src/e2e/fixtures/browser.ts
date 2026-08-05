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
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll } from "vite-plus/test";

import { E2E_BASE_URL, organizationDashboardPath } from "../constants";
import {
  cleanupEmulatorIdentity,
  provisionEmulatorIdentity,
  type EmulatorIdentity,
} from "../helpers/emulator-identity";

const ONBOARDING_PATH = "/auth/onboarding";
const SIGN_IN_PATH = "/auth/sign-in";

type E2eBrowserContext = {
  browser: Browser;
  page: Page;
  identities: EmulatorIdentity[];
};

let sharedContext: E2eBrowserContext | null = null;

async function completeEmulatorLogin(page: Page, email: string) {
  await page.goto(new URL(SIGN_IN_PATH, E2E_BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
  });

  // AuthKit redirects to workos-emulate's interactive login page.
  await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('button[type="submit"]').click();
}

export function useE2eBrowser() {
  beforeAll(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    sharedContext = { browser, page, identities: [] };
  });

  afterAll(async () => {
    const context = sharedContext;
    sharedContext = null;

    if (!context) {
      return;
    }

    try {
      for (const identity of context.identities) {
        await cleanupEmulatorIdentity(identity);
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

function trackIdentity(identity: EmulatorIdentity) {
  if (!sharedContext) {
    return;
  }

  sharedContext.identities.push(identity);
}

export async function loginForOnboarding(page: Page) {
  const identity = await provisionEmulatorIdentity({ mode: "onboarding" });
  trackIdentity(identity);

  await completeEmulatorLogin(page, identity.email);
  await page.waitForURL((url) => url.pathname.includes("/auth/onboarding"), {
    timeout: 30_000,
  });
  await page.goto(new URL(ONBOARDING_PATH, E2E_BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
  });

  return identity;
}

export async function loginAsAdmin(page: Page) {
  const identity = await provisionEmulatorIdentity({ mode: "admin", role: "admin" });
  trackIdentity(identity);

  await completeEmulatorLogin(page, identity.email);

  const dashboardPath = organizationDashboardPath(identity.organizationSlug);
  await page.waitForURL(
    (url) =>
      url.pathname.includes(`/org/${identity.organizationSlug}/`) ||
      url.pathname.endsWith("/dashboard") ||
      url.pathname.includes("/dashboard"),
    { timeout: 30_000 },
  );

  if (!page.url().includes(`/org/${identity.organizationSlug}/`)) {
    await page.goto(new URL(dashboardPath, E2E_BASE_URL).toString(), {
      waitUntil: "domcontentloaded",
    });
  }

  return identity;
}
