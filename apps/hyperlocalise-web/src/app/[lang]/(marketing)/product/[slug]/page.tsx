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

import {
  getAgentsAutomationFaqItems,
  getAgentsAutomationFaqSectionCopy,
} from "@/components/marketing/product/agents-automation-faq-content";
import { ProductPage } from "@/components/marketing/product/product-page";
import { DomainsPage } from "@/components/marketing/product/domains-page";
import { GuidelinesPage } from "@/components/marketing/product/guidelines-page";
import { HyperlabPage } from "@/components/marketing/product/hyperlab-page";
import { MultilingualContentStudioPage } from "@/components/marketing/product/multilingual-content-studio-page";
import {
  productPagesBySlug,
  productSlugs,
  type ProductPageSlug,
} from "@/components/marketing/product/product-page-content";
import { getIntlShape } from "@/lib/app-i18n/intl";
import {
  DEFAULT_APP_LOCALE,
  normalizeAppLocale,
  SUPPORTED_APP_LOCALES,
} from "@/lib/app-i18n/locales";
import { JsonLd } from "@/components/seo/json-ld";
import { getLocalizedAlternates, localizedOpenGraph } from "@/lib/seo/localized-alternates";

import { buildProductJsonLd } from "./build-product-json-ld";
import { getProductRouteMetadata } from "./product-route-metadata";

const productJsonLdSlugs = new Set<string>(productSlugs);

type ProductRouteParams = {
  lang: string;
  slug: string;
};

type ProductRouteProps = {
  params: Promise<ProductRouteParams>;
};

export function generateStaticParams() {
  const slugs = [...productSlugs, "next-gen-cat-tool", "self-evolving-knowledge"];
  return SUPPORTED_APP_LOCALES.flatMap((lang) => slugs.map((slug) => ({ lang, slug })));
}

export async function generateMetadata({ params }: ProductRouteProps): Promise<Metadata> {
  const { lang, slug } = await params;
  if (slug === "next-gen-cat-tool" || slug === "self-evolving-knowledge") {
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
    openGraph: localizedOpenGraph(locale, `/product/${slug}`, {
      title,
      description,
      type: "website",
    }),
  };
}

function renderProductPage(slug: string, locale: string) {
  if (slug === "multilingual-content-studio") {
    return <MultilingualContentStudioPage />;
  }

  if (slug === "guidelines") {
    return <GuidelinesPage />;
  }

  if (slug === "domains") {
    return <DomainsPage />;
  }

  if (slug === "hyperlab") {
    return <HyperlabPage />;
  }

  const content = productPagesBySlug[slug as keyof typeof productPagesBySlug];

  if (!content) {
    notFound();
  }

  if (slug === "agents-automation") {
    const faqCopy = getAgentsAutomationFaqSectionCopy(locale);
    return (
      <ProductPage
        content={content}
        faqItems={getAgentsAutomationFaqItems(locale)}
        faqHeading={faqCopy.heading}
        faqSubheading={faqCopy.subheading}
      />
    );
  }

  return <ProductPage content={content} />;
}

export default async function ProductRoutePage({ params }: ProductRouteProps) {
  const { lang, slug } = await params;

  if (slug === "next-gen-cat-tool") {
    permanentRedirect(`/${lang}/product/multilingual-content-studio`);
  }

  if (slug === "self-evolving-knowledge") {
    permanentRedirect(`/${lang}/product/guidelines`);
  }

  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const page = renderProductPage(slug, locale);
  const jsonLd = productJsonLdSlugs.has(slug)
    ? buildProductJsonLd(slug as ProductPageSlug, locale)
    : null;

  return (
    <>
      {jsonLd ? <JsonLd data={jsonLd} /> : null}
      {page}
    </>
  );
}
