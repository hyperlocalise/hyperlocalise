/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { MetadataRoute } from "next";

import { SUPPORTED_APP_LOCALES } from "@/lib/app-i18n/locales";
import { SITE_URL } from "@/lib/seo/site-url";

export default function robots(): MetadataRoute.Robots {
  const protectedLocalizedDisallows = SUPPORTED_APP_LOCALES.flatMap((locale) => [
    `/${locale}/dashboard/`,
    `/${locale}/org/`,
  ]);

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/auth/", "/api/", "/mcp", ...protectedLocalizedDisallows],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
