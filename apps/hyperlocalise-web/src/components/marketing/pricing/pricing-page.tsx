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
import { HomepageFaqSection } from "@/components/marketing/homepage-faq-section";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import type { HomepageFaqItem } from "@/components/marketing/homepage-faq-content";
import { TypographyH1, TypographyP } from "@/components/ui/typography";

import { PricingCustomerLogos } from "./pricing-customer-logos";
import { PricingHeroVisual } from "./pricing-hero-visual";
import { PricingAiFeaturesSection } from "./pricing-ai-features-section";
import { PricingModelsSection } from "./pricing-models-section";
import { PricingComparisonMatrix } from "./pricing-comparison-matrix";
import {
  getPricingAiFeatures,
  getPricingMatrixSections,
  getPricingModelsSectionContent,
  getPricingPageCopy,
  getPricingPlans,
} from "./pricing-page-content";
import { PricingPlansSection } from "./pricing-plans-section";
import { PricingUndecidedCta } from "./pricing-undecided-cta";

/** Split a headline after its first sentence so the second can be tinted. */
function splitHeadline(headline: string): [string, string | null] {
  const match = /^([\s\S]+?[.!?。！？])\s*(\S[\s\S]*)$/u.exec(headline);
  return match ? [match[1], match[2]] : [headline, null];
}

type PricingPageProps = {
  locale: string;
  faqItems: readonly HomepageFaqItem[];
};

export function PricingPage({ locale, faqItems }: PricingPageProps) {
  const copy = getPricingPageCopy(locale);
  const plans = getPricingPlans(locale);
  const matrixSections = getPricingMatrixSections(locale);
  const aiFeatures = getPricingAiFeatures(locale);
  const modelsSection = getPricingModelsSectionContent(locale);
  const [headlineLead, headlineRest] = splitHeadline(copy.headline);
  const heroPlan = plans.find((plan) => plan.id === "starter");
  const heroAmount = heroPlan ? Number.parseFloat(heroPlan.price.replace(/[^\d.]/g, "")) : NaN;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl">
        <section className="grid items-center gap-10 px-5 pt-14 pb-12 sm:px-8 sm:pt-20 sm:pb-16 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-14 lg:px-10">
          <div className="max-w-2xl space-y-5">
            <TypographyH1 className="text-balance">
              <span className="block">{headlineLead}</span>
              {headlineRest ? (
                <span className="block text-primary/55 dark:text-primary/70">{headlineRest}</span>
              ) : null}
            </TypographyH1>
            <TypographyP size="large" tone="subtle">
              {copy.subcopy}
            </TypographyP>
          </div>
          {heroPlan && Number.isFinite(heroAmount) ? (
            <PricingHeroVisual planName={heroPlan.name} amount={heroAmount} />
          ) : null}
        </section>

        <section className="px-5 pb-20 sm:px-8 sm:pb-24 lg:px-10">
          <PricingPlansSection plans={plans} popularBadge={copy.popularBadge} />
        </section>

        <section className="border-t border-border scroll-mt-24">
          <div className="px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
            <PricingComparisonMatrix
              plans={plans}
              sections={matrixSections}
              heading={copy.compareHeading}
              subcopy={copy.compareSubcopy}
              includedAriaLabel={copy.includedAriaLabel}
              notIncludedAriaLabel={copy.notIncludedAriaLabel}
            />
          </div>
        </section>

        <section className="pb-20 sm:pb-24">
          <PricingCustomerLogos />
        </section>

        <section className="border-t border-border scroll-mt-24">
          <div className="px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
            <PricingModelsSection {...modelsSection} />
          </div>
        </section>

        <section className="border-t border-border scroll-mt-24">
          <div className="px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
            <PricingAiFeaturesSection
              heading={copy.aiFeaturesHeading}
              subcopy={copy.aiFeaturesSubcopy}
              features={aiFeatures}
            />
          </div>
        </section>

        <section className="border-t border-border scroll-mt-24">
          <div className="px-5 py-24 sm:px-8 sm:py-28 lg:px-10">
            <HomepageFaqSection items={faqItems} />
          </div>
        </section>

        <section>
          <div className="px-5 pb-8 sm:px-8 lg:px-10">
            <PricingUndecidedCta
              heading={copy.undecidedHeading}
              talkToSalesLabel={copy.talkToSales}
              requestDemoLabel={copy.requestDemo}
              locale={locale}
            />
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
