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

/**
 * When each marketing page's content last changed in a way a reader would notice.
 *
 * Search engines stop trusting `lastmod` when it moves on every build, so the sitemap
 * reads these dates instead of `new Date()`. Bump the date when you change a page's copy.
 * Do not bump it for refactors, styling, or dependency updates.
 */
export const MARKETING_PAGE_LAST_MODIFIED = {
  "/": "2026-11-14",
  "/pricing": "2026-11-23",
  "/company": "2026-09-27",
  "/contact": "2026-09-27",
  "/startups": "2026-09-27",
  "/iris": "2026-11-21",
  "/localisation-audit": "2026-11-20",
  "/integrations": "2026-11-25",
  "/terms": "2026-08-26",
  "/privacy": "2026-08-26",
  "/install": "2026-08-29",
} as const;

export type MarketingPagePath = keyof typeof MARKETING_PAGE_LAST_MODIFIED;

/**
 * One date per family of templated pages. Add a slug to the matching override map
 * when a single page in the family changes on its own.
 */
export const MARKETING_SECTION_LAST_MODIFIED = {
  product: "2026-11-17",
  useCase: "2026-11-21",
  integration: "2026-11-25",
} as const;

export type MarketingSection = keyof typeof MARKETING_SECTION_LAST_MODIFIED;

const MARKETING_SECTION_SLUG_OVERRIDES: Record<MarketingSection, Record<string, string>> = {
  product: {},
  useCase: {},
  integration: {},
};

export function getMarketingPageLastModified(path: MarketingPagePath): Date {
  return new Date(MARKETING_PAGE_LAST_MODIFIED[path]);
}

export function getMarketingSectionLastModified(section: MarketingSection, slug: string): Date {
  const override = MARKETING_SECTION_SLUG_OVERRIDES[section][slug];
  return new Date(override ?? MARKETING_SECTION_LAST_MODIFIED[section]);
}
