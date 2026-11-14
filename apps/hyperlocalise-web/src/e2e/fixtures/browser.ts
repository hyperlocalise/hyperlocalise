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
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { afterAll, beforeAll } from "vite-plus/test";

import type { OrganizationMembershipRole } from "@/lib/database/types";

import { E2E_BASE_URL, organizationDashboardPath } from "../constants";
import {
  captureOnboardingWorkspace,
  cleanupEmulatorIdentity,
  provisionEmulatorIdentity,
  type EmulatorIdentity,
} from "../helpers/emulator-identity";

export { captureOnboardingWorkspace };

const ONBOARDING_PATH = "/auth/onboarding";
const SIGN_IN_PATH = "/auth/sign-in";
const DIALOG_OPEN_ATTEMPTS = 3;
const DIALOG_OPEN_TIMEOUT_MS = 5_000;
const DIALOG_ANNOUNCER_TIMEOUT_MS = 1_000;
const SETTLED_PAGE_TIMEOUT_MS = 15_000;

type E2eBrowserContext = {
  browser: Browser;
  page: Page;
  identities: EmulatorIdentity[];
};

let sharedContext: E2eBrowserContext | null = null;

export async function completeEmulatorLogin(page: Page, email: string) {
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
  return loginWithRole(page, "admin");
}

export async function loginWithRole(page: Page, role: OrganizationMembershipRole) {
  const identity = await provisionWorkspaceIdentity(role);
  return loginAsIdentity(page, identity);
}

/** Provisions a user with its own workspace without signing in; cleaned up with the suite. */
export async function provisionWorkspaceIdentity(role: OrganizationMembershipRole = "admin") {
  const identity = await provisionEmulatorIdentity({ mode: "admin", role });
  trackIdentity(identity);
  return identity;
}

/** Signs in as an already provisioned identity and opens its workspace dashboard. */
export async function loginAsIdentity(page: Page, identity: EmulatorIdentity) {
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

  await dismissUpdateAnnouncer(page);

  return identity;
}

/** Opens an app path and waits for its page heading. */
export async function openPageWithHeading(page: Page, path: string, heading: string) {
  await page.goto(new URL(path, E2E_BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page
    .getByRole("heading", { name: heading, exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
}

/**
 * Waits for client queries to finish so an absence check does not pass before the
 * data that would render the element has loaded.
 */
export async function waitForSettledPage(page: Page) {
  try {
    await page.waitForLoadState("networkidle", { timeout: SETTLED_PAGE_TIMEOUT_MS });
  } catch {
    // Long-polling pages never go idle; the heading wait already proved the page rendered.
  }
}

/**
 * Clicks a dialog trigger until the dialog opens. The trigger renders before the page
 * hydrates, and a click that lands before hydration does nothing.
 */
export async function openDialog(page: Page, trigger: Locator, dialogName: string) {
  const dialog = page.getByRole("dialog", { name: dialogName });
  for (let attempt = 0; attempt < DIALOG_OPEN_ATTEMPTS; attempt += 1) {
    await dismissUpdateAnnouncer(page, DIALOG_ANNOUNCER_TIMEOUT_MS);
    await trigger.click();
    try {
      await dialog.waitFor({ state: "visible", timeout: DIALOG_OPEN_TIMEOUT_MS });
      return dialog;
    } catch {
      // Retry below.
    }
  }

  await dialog.waitFor({ state: "visible", timeout: DIALOG_OPEN_TIMEOUT_MS });
  return dialog;
}

export async function dismissUpdateAnnouncer(page: Page, timeout = 5_000) {
  const dismiss = page.getByRole("button", { name: "Not now" });
  try {
    await dismiss.waitFor({ state: "visible", timeout });
    await dismiss.click();
    await dismiss.waitFor({ state: "hidden", timeout: 5_000 });
  } catch {
    // The product update card is optional and may already be dismissed.
  }
}
