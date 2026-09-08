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
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";

import { ProductPage } from "@/components/marketing/product/product-page";
import { MultilingualContentStudioPage } from "@/components/marketing/product/multilingual-content-studio-page";
import {
  productPagesBySlug,
  productSlugs,
} from "@/components/marketing/product/product-page-content";
import { Skeleton } from "@/components/ui/skeleton";
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
  if (slug === "next-gen-cat-tool") {
    return {};
  }
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

export default function ProductRoutePage({ params }: ProductRouteProps) {
  return (
    <Suspense fallback={<ProductRouteFallback />}>
      <ProductRouteContent params={params} />
    </Suspense>
  );
}

async function ProductRouteContent({ params }: ProductRouteProps) {
  const { lang, slug } = await params;

  if (slug === "next-gen-cat-tool") {
    permanentRedirect(`/${lang}/product/multilingual-content-studio`);
  }

  if (slug === "multilingual-content-studio") {
    return <MultilingualContentStudioPage />;
  }
  const content = productPagesBySlug[slug as keyof typeof productPagesBySlug];

  if (!content) {
    notFound();
  }

  return <ProductPage content={content} />;
}

function ProductRouteFallback() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl">
        <section className="px-5 py-20 sm:px-8 sm:py-24 lg:px-10 lg:py-20">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8">
            <Skeleton className="h-16 w-3/4 max-w-2xl" />
            <Skeleton className="h-8 w-1/2 max-w-md" />
            <Skeleton className="h-11 w-40" />
          </div>
        </section>
        <section className="px-3 pb-20 sm:px-6 lg:px-8">
          <Skeleton className="mx-auto h-[28rem] w-full max-w-6xl" />
        </section>
      </div>
    </div>
  );
}
