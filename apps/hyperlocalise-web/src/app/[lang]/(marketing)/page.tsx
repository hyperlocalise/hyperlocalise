import type { Metadata } from "next";
import type { WithContext } from "schema-dts";
import { WebApplication } from "schema-dts";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { chapters, footerColumns } from "@/components/marketing/marketing-page-content";
import { JsonLd } from "@/components/seo/json-ld";
import {
  ChapterSection,
  ChangelogSection,
  FinalCtaSection,
  HeroSection,
  PrinciplesSection,
} from "@/components/marketing";
import { getIntlShape } from "@/lib/app-i18n/intl";

import { marketingHomeMessages } from "./homepage.messages";

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
  const intl = getIntlShape(lang);

  const title = intl.formatMessage(marketingHomeMessages.metadataTitle);
  const description = intl.formatMessage(marketingHomeMessages.metadataDescription);
  const openGraphDescription = intl.formatMessage(
    marketingHomeMessages.metadataDescriptionOpenGraph,
  );
  const logoAlt = intl.formatMessage(marketingHomeMessages.logoAlt);

  return {
    title,
    description,
    keywords: [...metadataKeywords],
    openGraph: {
      title,
      description: openGraphDescription,
      type: "website",
      images: [
        {
          url: "https://www.hyperlocalise.com/images/logo.png",
          width: 512,
          height: 512,
          alt: logoAlt,
        },
      ],
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
      category: intl.formatMessage(marketingHomeMessages.offerCategoryFree),
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

  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="min-h-screen bg-background text-foreground">
        <main className="mx-auto max-w-7xl">
          <section className=" px-5 pb-14 pt-8 sm:px-8 lg:px-10 lg:pt-10">
            <HeroSection />
          </section>

          <section className="px-5 py-16 sm:px-8 lg:px-10">
            <PrinciplesSection />
          </section>

          <section id="workflow">
            {chapters.map((chapter) => (
              <section
                key={chapter.id}
                id={chapter.anchorId}
                className="border-t border-border/70 scroll-mt-24"
              >
                <div className="px-5 py-20 sm:px-8 lg:px-10">
                  <ChapterSection chapter={chapter} />
                </div>
              </section>
            ))}
          </section>

          <section className="border-t border-border/70">
            <div className="px-5 py-20 sm:px-8 lg:px-10">
              <ChangelogSection />
            </div>
          </section>

          <section className="border-t border-border/70">
            <div className="px-5 py-24 sm:px-8 lg:px-10">
              <FinalCtaSection />
            </div>
          </section>

          <section className="border-t border-border/70">
            <div className="px-5 py-16 sm:px-8 lg:px-10">
              <MarketingFooter columns={footerColumns} />
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
