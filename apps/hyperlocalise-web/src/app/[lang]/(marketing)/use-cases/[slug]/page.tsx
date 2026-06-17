import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UseCasePage, useCasePagesBySlug, useCaseSlugs } from "@/components/marketing/use-case";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { SUPPORTED_APP_LOCALES } from "@/lib/app-i18n/locales";

import { getUseCaseRouteMetadata } from "./use-case-route-metadata";

type UseCaseRouteParams = {
  lang: string;
  slug: string;
};

type UseCaseRouteProps = {
  params: Promise<UseCaseRouteParams>;
};

export function generateStaticParams() {
  return SUPPORTED_APP_LOCALES.flatMap((lang) => useCaseSlugs.map((slug) => ({ lang, slug })));
}

export async function generateMetadata({ params }: UseCaseRouteProps): Promise<Metadata> {
  const { lang, slug } = await params;
  const content = useCasePagesBySlug[slug];

  if (!content) {
    return {};
  }

  const intl = getIntlShape(lang);
  const metadata = getUseCaseRouteMetadata(slug, intl);

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

export default async function UseCaseRoutePage({ params }: UseCaseRouteProps) {
  const { slug } = await params;
  const content = useCasePagesBySlug[slug];

  if (!content) {
    notFound();
  }

  return <UseCasePage content={content} />;
}
