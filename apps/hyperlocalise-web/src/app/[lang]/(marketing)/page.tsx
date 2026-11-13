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

import { buildHomeJsonLd } from "./build-home-json-ld";
import { getHomepageFaqItems } from "@/components/marketing/homepage-faq-content";
import { HomepageFaqSection } from "@/components/marketing/homepage-faq-section";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { JsonLd } from "@/components/seo/json-ld";
import { RecentBlogPostsSection } from "@/components/marketing/recent-blog-posts-section";
import { TourfinderTestimonialSection } from "@/components/marketing/tourfinder-testimonial-section";
import {
  PlatformHomepage,
  HomepageFinalCta,
} from "@/components/marketing/homepage/platform-homepage";
import {
  getPricingPageCopy,
  getPricingPlans,
} from "@/components/marketing/pricing/pricing-page-content";
import { PricingPlansSection } from "@/components/marketing/pricing/pricing-plans-section";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { getAllPosts } from "@/lib/blog/blog-post";
import { getMarketingIntegrations } from "@/components/marketing/integrations/integrations-page-content";
import { getLocalizedAlternates, localizedOpenGraph } from "@/lib/seo/localized-alternates";

const metadataKeywords = [
  "Hyperlocalise",
  "AI localisation platform",
  "localization platform",
  "international growth",
  "global expansion",
  "localisation",
  "localization",
  "translation",
  "website translation",
  "app localisation",
  "cultural adaptation",
  "video localisation",
  "compliance",
  "AI",
] as const;

type HomePageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const intl = getIntlShape(locale);

  const title = intl.formatMessage({
    defaultMessage: "AI Localisation Platform for International Growth | Hyperlocalise",
    id: "iakGT6ABzj",
    description: "Page title for the marketing homepage",
  });
  const description = intl.formatMessage({
    defaultMessage:
      "The AI localisation platform for international growth. Translate websites and apps with your TMS, adapt images and video to local cultures, and check every market's rules before you go live.",
    id: "jgfYN8ytVV",
    description: "Meta description for the marketing homepage",
  });
  const openGraphDescription = intl.formatMessage({
    defaultMessage: "The AI partner for international growth.",
    id: "3LHetSCirA",
    description:
      "Open Graph meta description for the marketing homepage (shorter than the main description)",
  });

  return {
    title,
    description,
    keywords: [...metadataKeywords],
    alternates: getLocalizedAlternates({ locale, path: "/" }),
    openGraph: localizedOpenGraph(locale, "/", {
      title,
      description: openGraphDescription,
      type: "website",
    }),
  };
}

export default async function Home({ params }: HomePageProps) {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const jsonLd = buildHomeJsonLd(locale);
  const faqItems = getHomepageFaqItems(locale);
  const integrationCategoryOrder = [
    "tms",
    "source-control",
    "cms",
    "guidelines",
    "collaboration",
    "seo-tools",
    "customer-engagement",
  ];
  const integrations = getMarketingIntegrations(locale)
    .filter(
      (item) => item.status === "available" && integrationCategoryOrder.includes(item.category),
    )
    .sort(
      (a, b) =>
        integrationCategoryOrder.indexOf(a.category) - integrationCategoryOrder.indexOf(b.category),
    )
    .map((item) => ({
      slug: item.slug,
      name: item.name,
      logoSrc: "logoSrc" in item ? item.logoSrc : undefined,
      iconKey: "iconKey" in item ? item.iconKey : undefined,
    }));
  const recentPosts = getAllPosts(lang)
    .slice(0, 4)
    .map(({ content: _content, ...rest }) => rest);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PlatformHomepage
        integrations={integrations}
        plans={
          <PricingPlansSection
            plans={getPricingPlans(lang)}
            popularBadge={getPricingPageCopy(lang).popularBadge}
          />
        }
      >
        <div className="mx-auto max-w-7xl">
          <TourfinderTestimonialSection />
        </div>
      </PlatformHomepage>

      <div className="mx-auto max-w-7xl">
        <JsonLd data={jsonLd} />
        <section className="border-t border-border scroll-mt-24">
          <div className="px-5 py-24 sm:px-8 sm:py-28 lg:px-10">
            <HomepageFaqSection items={faqItems} />
          </div>
        </section>
      </div>

      <HomepageFinalCta />

      <div className="mx-auto max-w-7xl">
        <section className="border-t border-border">
          <div className="px-5 py-24 sm:px-8 sm:py-28 lg:px-10">
            <RecentBlogPostsSection lang={lang} posts={recentPosts} />
          </div>
        </section>

        <section className="border-t border-border">
          <div className="px-5 pt-20 sm:px-8 sm:pt-24 lg:px-10">
            <MarketingFooter columns={footerColumns} />
          </div>
        </section>
      </div>
    </div>
  );
}
