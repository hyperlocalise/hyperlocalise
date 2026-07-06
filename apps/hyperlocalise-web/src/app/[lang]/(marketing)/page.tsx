import type { Metadata } from "next";
import type { WithContext } from "schema-dts";
import { WebApplication } from "schema-dts";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { chapters, footerColumns } from "@/components/marketing/marketing-page-content";
import { JsonLd } from "@/components/seo/json-ld";
import {
  ChapterSection,
  FinalCtaSection,
  HeroSection,
  PrinciplesSection,
  RecentBlogPostsSection,
} from "@/components/marketing";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAllPosts } from "@/lib/blog/blog-post";

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
  const recentPosts = getAllPosts(lang)
    .slice(0, 4)
    .map(({ content: _content, ...rest }) => rest);

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
                className="border-t border-border scroll-mt-24"
              >
                <div className="px-5 py-20 sm:px-8 lg:px-10">
                  <ChapterSection chapter={chapter} />
                </div>
              </section>
            ))}
          </section>

          <section className="border-t border-border">
            <div className="px-5 py-20 sm:px-8 lg:px-10">
              <RecentBlogPostsSection lang={lang} posts={recentPosts} />
            </div>
          </section>

          <section className="border-t border-border">
            <div className="px-5 py-24 sm:px-8 lg:px-10">
              <FinalCtaSection />
            </div>
          </section>

          <section className="border-t border-border">
            <div className="px-5 py-16 sm:px-8 lg:px-10">
              <MarketingFooter columns={footerColumns} />
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
