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
import { notFound } from "next/navigation";

import { ProductPage, productPagesBySlug, productSlugs } from "@/components/marketing/product";
import { getIntlShape } from "@/lib/app-i18n/intl";
import {
  DEFAULT_APP_LOCALE,
  normalizeAppLocale,
  SUPPORTED_APP_LOCALES,
} from "@/lib/app-i18n/locales";
import { getLocalizedAlternates } from "@/lib/seo/localized-alternates";

import { getProductRouteMetadata } from "./product-route-metadata";

type ProductRouteParams = {
  lang: string;
  slug: string;
};

type ProductRouteProps = {
  params: Promise<ProductRouteParams>;
};

export function generateStaticParams() {
  return SUPPORTED_APP_LOCALES.flatMap((lang) => productSlugs.map((slug) => ({ lang, slug })));
}

export async function generateMetadata({ params }: ProductRouteProps): Promise<Metadata> {
  const { lang, slug } = await params;
  const content = productPagesBySlug[slug as keyof typeof productPagesBySlug];

  if (!content) {
    return {};
  }

  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const intl = getIntlShape(locale);
  const metadata = getProductRouteMetadata(slug, intl);

  if (!metadata) {
    return {};
  }

  const { title, description } = metadata;

  return {
    title,
    description,
    keywords: content.metadata.keywords,
    alternates: getLocalizedAlternates({ locale, path: `/product/${slug}` }),
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default async function ProductRoutePage({ params }: ProductRouteProps) {
  const { slug } = await params;
  const content = productPagesBySlug[slug as keyof typeof productPagesBySlug];

  if (!content) {
    notFound();
  }

  return <ProductPage content={content} />;
}
