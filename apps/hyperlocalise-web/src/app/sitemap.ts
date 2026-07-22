/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { MetadataRoute } from "next";

import { productSlugs } from "@/components/marketing/product";
import { useCaseSlugs } from "@/components/marketing/use-case";
import { SUPPORTED_APP_LOCALES, type AppLocale } from "@/lib/app-i18n/locales";
import { getAllPosts, getPostBySlug, parseBlogPostDate } from "@/lib/blog/blog-post";
import { getBlogPostPath } from "@/lib/blog/blog-post-path";
import {
  getLocalizedAbsoluteUrl,
  getSitemapLanguageAlternates,
} from "@/lib/seo/localized-alternates";
import { SITE_URL } from "@/lib/seo/site-url";

function localizedSitemapEntry({
  locale,
  path,
  lastModified,
  changeFrequency,
  priority,
  locales = SUPPORTED_APP_LOCALES,
}: {
  locale: AppLocale;
  path: string;
  lastModified: Date;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
  locales?: readonly AppLocale[];
}): MetadataRoute.Sitemap[number] {
  return {
    url: getLocalizedAbsoluteUrl(locale, path),
    lastModified,
    changeFrequency,
    priority,
    alternates: {
      languages: getSitemapLanguageAlternates(path, locales),
    },
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const localizedStaticPaths = [
    { path: "/", changeFrequency: "weekly" as const, priority: 1 },
    { path: "/terms", changeFrequency: "monthly" as const, priority: 0.5 },
    { path: "/privacy", changeFrequency: "monthly" as const, priority: 0.5 },
    { path: "/trust-center", changeFrequency: "monthly" as const, priority: 0.5 },
  ];

  const localizedStaticEntries: MetadataRoute.Sitemap = SUPPORTED_APP_LOCALES.flatMap((locale) =>
    localizedStaticPaths.map(({ path, changeFrequency, priority }) =>
      localizedSitemapEntry({ locale, path, lastModified: now, changeFrequency, priority }),
    ),
  );

  const productEntries: MetadataRoute.Sitemap = SUPPORTED_APP_LOCALES.flatMap((locale) =>
    productSlugs.map((slug) =>
      localizedSitemapEntry({
        locale,
        path: `/product/${slug}`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.8,
      }),
    ),
  );

  const useCaseEntries: MetadataRoute.Sitemap = SUPPORTED_APP_LOCALES.flatMap((locale) =>
    useCaseSlugs.map((slug) =>
      localizedSitemapEntry({
        locale,
        path: `/use-cases/${slug}`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.8,
      }),
    ),
  );

  const blogIndexEntries: MetadataRoute.Sitemap = SUPPORTED_APP_LOCALES.map((locale) =>
    localizedSitemapEntry({
      locale,
      path: "/blog",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    }),
  );

  const blogPostEntries: MetadataRoute.Sitemap = SUPPORTED_APP_LOCALES.flatMap((locale) =>
    getAllPosts(locale).flatMap((post) => {
      const postPath = getBlogPostPath(locale, post.slug);
      if (!postPath) {
        return [];
      }

      const lastModified = parseBlogPostDate(post.date);
      if (!lastModified) {
        return [];
      }

      const availableLocales = SUPPORTED_APP_LOCALES.filter(
        (candidateLocale) => getPostBySlug(post.slug, candidateLocale) != null,
      );

      return [
        localizedSitemapEntry({
          locale,
          path: `/blog/${post.slug}`,
          lastModified,
          changeFrequency: "monthly",
          priority: 0.7,
          locales: availableLocales,
        }),
      ];
    }),
  );

  return [
    ...localizedStaticEntries,
    {
      url: `${SITE_URL}/install`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...productEntries,
    ...useCaseEntries,
    ...blogIndexEntries,
    ...blogPostEntries,
  ];
}
