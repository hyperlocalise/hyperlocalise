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
import type { WithContext } from "schema-dts";
import { WebApplication } from "schema-dts";
import {
  buildHomepageFaqJsonLd,
  getHomepageFaqItems,
} from "@/components/marketing/homepage-faq-content";
import { HomepageFaqSection } from "@/components/marketing/homepage-faq-section";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { JsonLd } from "@/components/seo/json-ld";
import { TourfinderTestimonialSection } from "@/components/marketing/tourfinder-testimonial-section";
import {
  FeatureMeshCardsSection,
  FinalCtaSection,
  HeroSection,
  PrinciplesSection,
  RecentBlogPostsSection,
} from "@/components/marketing";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { getAllPosts } from "@/lib/blog/blog-post";
import { getLocalizedAlternates } from "@/lib/seo/localized-alternates";

const metadataKeywords = [
  "localisation",
  "translation",
  "AI",
  "agentic",
  "TMS",
  "localization",
  "GitHub",
] as const;

type HomePageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const intl = getIntlShape(locale);

  const title = intl.formatMessage({
    defaultMessage: "Hyperlocalise | Localisation Platform for the Agentic Era",
    id: "RZBs1fe1V3",
    description: "Page title for the marketing homepage",
  });
  const description = intl.formatMessage({
    defaultMessage:
      "Assign AI agents to translate, review, and sync content while keeping human review first-class. Stay flexible across LLM providers and TMS platforms.",
    id: "9/pQQpDU+H",
    description: "Meta description for the marketing homepage",
  });
  const openGraphDescription = intl.formatMessage({
    defaultMessage:
      "Assign AI agents to translate, review, and sync content while keeping human review first-class.",
    id: "D3VzMQGhqa",
    description:
      "Open Graph meta description for the marketing homepage (shorter than the main description)",
  });

  return {
    title,
    description,
    keywords: [...metadataKeywords],
    alternates: getLocalizedAlternates({ locale, path: "/" }),
    openGraph: {
      title,
      description: openGraphDescription,
      type: "website",
    },
  };
}

function buildJsonLd(locale: string): WithContext<WebApplication> & object {
  const intl = getIntlShape(locale);

  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Hyperlocalise",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Cloud",
    offers: {
      "@type": "Offer",
      category: intl.formatMessage({
        defaultMessage: "Free",
        id: "8FzJDvElQ4",
        description: "Schema.org offer category indicating a free tier on the marketing homepage",
      }),
      availability: "https://schema.org/PreOrder",
    },
    provider: {
      "@type": "Organization",
      name: "Hyperlocalise",
      url: "https://hyperlocalise.com",
    },
  };
}

export default async function Home({ params }: HomePageProps) {
  const { lang } = await params;
  const jsonLd = buildJsonLd(lang);
  const faqItems = getHomepageFaqItems(lang);
  const faqJsonLd = buildHomepageFaqJsonLd(faqItems);
  const recentPosts = getAllPosts(lang)
    .slice(0, 4)
    .map(({ content: _content, ...rest }) => rest);

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={faqJsonLd} />
      <div className="min-h-screen bg-background text-foreground">
        <HeroSection />

        <main className="mx-auto max-w-7xl">
          <section className="border-t border-border">
            <div className="px-5 py-24 sm:px-8 sm:py-28 lg:px-10">
              <PrinciplesSection />
            </div>
          </section>

          <div className="border-t border-border">
            <TourfinderTestimonialSection />
          </div>

          <section className="border-t border-border scroll-mt-24">
            <div className="px-5 py-24 sm:px-8 sm:py-28 lg:px-10">
              <FeatureMeshCardsSection />
            </div>
          </section>

          <section className="border-t border-border scroll-mt-24">
            <div className="px-5 py-24 sm:px-8 sm:py-28 lg:px-10">
              <HomepageFaqSection items={faqItems} />
            </div>
          </section>

          <section className="border-t border-border">
            <div className="px-5 py-28 sm:px-8 sm:py-32 lg:px-10">
              <FinalCtaSection />
            </div>
          </section>

          <section className="border-t border-border">
            <div className="px-5 py-24 sm:px-8 sm:py-28 lg:px-10">
              <RecentBlogPostsSection lang={lang} posts={recentPosts} />
            </div>
          </section>

          <section className="border-t border-border">
            <div className="px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
              <MarketingFooter columns={footerColumns} />
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
