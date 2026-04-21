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
  LogoStripSection,
  PrinciplesSection,
} from "@/components/marketing";

export const metadata: Metadata = {
  title: "Hyperlocalise | Localisation Platform for the Agentic Era",
  description:
    "Assign AI agents to translate, review, and sync content while keeping human review first-class. Stay flexible across LLM providers and TMS platforms.",
  keywords: ["localisation", "translation", "AI", "agentic", "TMS", "localization", "GitHub"],
  openGraph: {
    title: "Hyperlocalise | Localisation Platform for the Agentic Era",
    description:
      "Assign AI agents to translate, review, and sync content while keeping human review first-class.",
    type: "website",
    images: [
      {
        url: "https://hyperlocalise.com/images/logo.png",
        width: 512,
        height: 512,
        alt: "Hyperlocalise",
      },
    ],
  },
};

const jsonLd: WithContext<WebApplication> & object = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Hyperlocalise",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Cloud",
  offers: {
    "@type": "Offer",
    category: "Free",
    availability: "https://schema.org/PreOrder",
  },
  provider: {
    "@type": "Organization",
    name: "Hyperlocalise",
    url: "https://hyperlocalise.com",
  },
};

export default function Home() {
  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="min-h-screen bg-background text-foreground">
        <main className="mx-auto max-w-7xl">
          <section className=" px-5 pb-14 pt-8 sm:px-8 lg:px-10 lg:pt-10">
            <HeroSection />
          </section>

          <div className="border-y border-border/70">
            <section className="px-5 py-6 sm:px-8 lg:px-10">
              <LogoStripSection />
            </section>
          </div>

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
