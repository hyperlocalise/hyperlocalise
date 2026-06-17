import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductPage, productPagesBySlug, productSlugs } from "@/components/marketing/product";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { SUPPORTED_APP_LOCALES } from "@/lib/app-i18n/locales";

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

  const intl = getIntlShape(lang);
  const metadata = getProductRouteMetadata(slug, intl);

  if (!metadata) {
    return {};
  }

  const { title, description } = metadata;

  return {
    title,
    description,
    keywords: content.metadata.keywords,
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
