import { MetadataRoute } from "next";

import { productSlugs } from "@/components/marketing/product";
import { useCaseSlugs } from "@/components/marketing/use-case";
import { SUPPORTED_APP_LOCALES } from "@/lib/app-i18n/locales";

const BASE_URL = "https://www.hyperlocalise.com";

function localizedPath(locale: string, path = "/") {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

function localizedUrl(locale: string, path = "/") {
  return `${BASE_URL}${localizedPath(locale, path)}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const localizedStaticPaths = ["/", "/terms", "/privacy", "/trust-center"];
  const localizedStaticEntries: MetadataRoute.Sitemap = SUPPORTED_APP_LOCALES.flatMap((locale) =>
    localizedStaticPaths.map((path) => ({
      url: localizedUrl(locale, path),
      lastModified: now,
      changeFrequency: path === "/" ? "weekly" : "monthly",
      priority: path === "/" ? 1 : 0.5,
    })),
  );

  const productEntries: MetadataRoute.Sitemap = SUPPORTED_APP_LOCALES.flatMap((locale) =>
    productSlugs.map((slug) => ({
      url: localizedUrl(locale, `/product/${slug}`),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    })),
  );

  const useCaseEntries: MetadataRoute.Sitemap = SUPPORTED_APP_LOCALES.flatMap((locale) =>
    useCaseSlugs.map((slug) => ({
      url: localizedUrl(locale, `/use-cases/${slug}`),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    })),
  );

  return [
    ...localizedStaticEntries,
    {
      url: `${BASE_URL}/install`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...productEntries,
    ...useCaseEntries,
  ];
}
