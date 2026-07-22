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
import type { Metadata } from "next";

import { BlogIndexPage } from "@/components/marketing/blog/blog-index-page";
import { getAllPosts } from "@/lib/blog/blog-post";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { getLocalizedAlternates } from "@/lib/seo/localized-alternates";

import { getBlogRouteMetadata } from "./blog-route-metadata";

type BlogIndexRouteProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: BlogIndexRouteProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const intl = getIntlShape(locale);
  const metadata = getBlogRouteMetadata(intl);

  return {
    title: metadata.title,
    description: metadata.description,
    alternates: getLocalizedAlternates({ locale, path: "/blog" }),
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      type: "website",
    },
  };
}

export default async function BlogIndexRoute({ params }: BlogIndexRouteProps) {
  const { lang } = await params;
  const posts = getAllPosts(lang);

  return <BlogIndexPage lang={lang} posts={posts} />;
}
