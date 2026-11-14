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
import { describe, expect, it } from "vite-plus/test";

import { E2E_DEFAULT_LOCALE, E2E_HOMEPAGE_HEADING, e2eUrl } from "../constants";
import { getE2ePage, useE2eBrowser } from "../fixtures/browser";

const MARKETING_PAGES = [
  { path: "/integrations", heading: "Integrations" },
  { path: "/iris", heading: "Iris, the AI localisation engine for multilingual assets" },
  { path: "/company", heading: "Built by people who believe localisation connects the world" },
  { path: "/startups", heading: "New markets. 100x momentum." },
  { path: "/localisation-audit", heading: "See how your brand travels." },
];

const FRENCH_HOMEPAGE_HEADING = "Le partenaire IA de votre croissance internationale.";

const NOT_FOUND_PATHS = [
  `/${E2E_DEFAULT_LOCALE}/this-page-does-not-exist`,
  `/${E2E_DEFAULT_LOCALE}/blog/this-post-does-not-exist`,
  // Locale segments must be full app locales such as `fr-FR`.
  "/fr",
];

describe("marketing pages", () => {
  useE2eBrowser();

  it("renders the homepage hero without sign-in", async () => {
    const page = getE2ePage();
    await page.goto(e2eUrl(`/${E2E_DEFAULT_LOCALE}`), { waitUntil: "domcontentloaded" });

    await page
      .getByRole("heading", { name: E2E_HOMEPAGE_HEADING })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("link", { name: /Explore the platform/i }).waitFor({ state: "visible" });
  });

  it("renders pricing, legal, and contact pages from local copy", async () => {
    const page = getE2ePage();

    await page.goto(e2eUrl(`/${E2E_DEFAULT_LOCALE}/pricing`), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Scale localisation. Control your costs." })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("heading", { name: "Compare plans" }).waitFor({ state: "visible" });

    await page.goto(e2eUrl(`/${E2E_DEFAULT_LOCALE}/privacy`), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Privacy policy" })
      .waitFor({ state: "visible", timeout: 30_000 });

    await page.goto(e2eUrl(`/${E2E_DEFAULT_LOCALE}/terms`), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Terms of service" })
      .waitFor({ state: "visible", timeout: 30_000 });

    await page.goto(e2eUrl(`/${E2E_DEFAULT_LOCALE}/contact`), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Talk with the Hyperlocalise team" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("button", { name: "Email support" }).waitFor({ state: "visible" });
  });

  it("renders product, company, and program pages", async () => {
    const page = getE2ePage();

    for (const { path, heading } of MARKETING_PAGES) {
      await page.goto(e2eUrl(`/${E2E_DEFAULT_LOCALE}${path}`), { waitUntil: "domcontentloaded" });
      await page
        .getByRole("heading", { name: heading, exact: true })
        .first()
        .waitFor({ state: "visible", timeout: 30_000 });
    }
  }, 120_000);

  it("lists blog posts and opens one", async () => {
    const page = getE2ePage();
    const blogPath = `/${E2E_DEFAULT_LOCALE}/blog`;
    await page.goto(e2eUrl(blogPath), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Blog", exact: true })
      .waitFor({ state: "visible", timeout: 30_000 });

    const firstPost = page.locator(`main a[href^="${blogPath}/"]`).first();
    const postPath = await firstPost.getAttribute("href");
    expect(postPath).toBeTruthy();
    await page.goto(e2eUrl(postPath ?? blogPath), { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { level: 1 }).waitFor({ state: "visible", timeout: 30_000 });
    expect(await page.getByRole("heading", { name: "Page not found" }).count()).toBe(0);
  }, 120_000);

  it("renders the homepage in French", async () => {
    const page = getE2ePage();
    await page.goto(e2eUrl("/fr-FR"), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: FRENCH_HOMEPAGE_HEADING })
      .waitFor({ state: "visible", timeout: 30_000 });
  });

  it("returns the not-found page for unknown paths and locales", async () => {
    const page = getE2ePage();

    for (const path of NOT_FOUND_PATHS) {
      const response = await page.goto(e2eUrl(path), { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(404);
      if (path.startsWith(`/${E2E_DEFAULT_LOCALE}/`)) {
        await page
          .getByRole("heading", { name: "Page not found" })
          .waitFor({ state: "visible", timeout: 30_000 });
      }
    }
  }, 120_000);
});
