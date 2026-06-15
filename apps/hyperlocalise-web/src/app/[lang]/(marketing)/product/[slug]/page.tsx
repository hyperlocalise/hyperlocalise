import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductPage, productPagesBySlug, productSlugs } from "@/components/marketing/product";
import { SUPPORTED_APP_LOCALES } from "@/lib/app-i18n/locales";

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
  const { slug } = await params;
  const content = productPagesBySlug[slug as keyof typeof productPagesBySlug];

  if (!content) {
    return {};
  }

  return {
    title: content.metadata.title,
    description: content.metadata.description,
    keywords: content.metadata.keywords,
    openGraph: {
      title: content.metadata.title,
      description: content.metadata.description,
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
