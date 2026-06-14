import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UseCasePage, useCasePagesBySlug, useCaseSlugs } from "@/components/marketing/use-case";
import { SUPPORTED_APP_LOCALES } from "@/lib/app-i18n/locales";

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
  const { slug } = await params;
  const content = useCasePagesBySlug[slug];

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
      images: [
        {
          url: "https://www.hyperlocalise.com/images/logo.png",
          width: 512,
          height: 512,
          alt: "Hyperlocalise",
        },
      ],
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
