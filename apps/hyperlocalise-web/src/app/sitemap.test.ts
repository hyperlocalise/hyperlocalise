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

import { SUPPORTED_APP_LOCALES } from "@/lib/app-i18n/locales";
import { SITE_URL } from "@/lib/seo/site-url";

import sitemap from "./sitemap";

describe("sitemap", () => {
  it("includes hreflang language alternates for localized marketing URLs", () => {
    const entries = sitemap();
    const homeEn = entries.find((entry) => entry.url === `${SITE_URL}/en`);

    expect(homeEn?.alternates?.languages).toEqual({
      en: `${SITE_URL}/en`,
      "zh-CN": `${SITE_URL}/zh-CN`,
      "vi-VN": `${SITE_URL}/vi-VN`,
      "de-DE": `${SITE_URL}/de-DE`,
      "fr-FR": `${SITE_URL}/fr-FR`,
      "x-default": `${SITE_URL}/en`,
    });

    for (const locale of SUPPORTED_APP_LOCALES) {
      const blogIndex = entries.find((entry) => entry.url === `${SITE_URL}/${locale}/blog`);
      expect(blogIndex?.alternates?.languages?.["x-default"]).toBe(`${SITE_URL}/en/blog`);
      expect(blogIndex?.alternates?.languages?.[locale]).toBe(`${SITE_URL}/${locale}/blog`);
    }
  });

  it("keeps the non-localized install URL without language alternates", () => {
    const entries = sitemap();
    const install = entries.find((entry) => entry.url === `${SITE_URL}/install`);

    expect(install).toBeDefined();
    expect(install?.alternates).toBeUndefined();
  });
});
