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
