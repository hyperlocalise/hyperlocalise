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
import { jsonLdInLanguage } from "@/lib/seo/json-ld-in-language";
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
import { DEFAULT_APP_LOCALE, normalizeAppLocale, type AppLocale } from "@/lib/app-i18n/locales";
import { getAllPosts } from "@/lib/blog/blog-post";
import { getLocalizedAlternates, localizedOpenGraph } from "@/lib/seo/localized-alternates";

const metadataKeywords = [
  "Hyperlocalise",
  "localisation",
  "localization",
  "translation",
  "translate",
  "product",
  "context",
  "launch",
  "review",
  "AI",
  "agentic",
  "TMS",
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
    defaultMessage: "Hyperlocalise | AI-native infrastructure for multilingual content operations",
    id: "vnqJFX0Vm1",
    description: "Page title for the marketing homepage",
  });
  const description = intl.formatMessage({
    defaultMessage:
      "Create, orchestrate, publish, and optimise multilingual content with Content Studio, Automation Workflow, Domains, Hyperlab, Guidelines, and AI agents.",
    id: "gWsVpsBaTk",
    description: "Meta description for the marketing homepage",
  });
  const openGraphDescription = intl.formatMessage({
    defaultMessage: "AI-native infrastructure for multilingual content operations.",
    id: "VmLY6IFMWn",
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

function buildJsonLd(locale: AppLocale): WithContext<WebApplication> & object {
  const intl = getIntlShape(locale);

  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    inLanguage: jsonLdInLanguage(locale),
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
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const jsonLd = buildJsonLd(locale);
  const faqItems = getHomepageFaqItems(locale);
  const faqJsonLd = buildHomepageFaqJsonLd(locale, faqItems);
  const recentPosts = getAllPosts(lang)
    .slice(0, 4)
    .map(({ content: _content, ...rest }) => rest);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PlatformHomepage
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
        <JsonLd data={faqJsonLd} />
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
