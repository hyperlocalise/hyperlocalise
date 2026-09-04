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

import { PricingAiFeaturesSection } from "./pricing-ai-features-section";
import { PricingComparisonMatrix } from "./pricing-comparison-matrix";
import {
  getPricingAiFeatures,
  getPricingMatrixSections,
  getPricingPageCopy,
  getPricingPlans,
} from "./pricing-page-content";
import { PricingPlansSection } from "./pricing-plans-section";
import { PricingUndecidedCta } from "./pricing-undecided-cta";

type PricingPageProps = {
  locale: string;
  faqItems: readonly HomepageFaqItem[];
};

export function PricingPage({ locale, faqItems }: PricingPageProps) {
  const copy = getPricingPageCopy(locale);
  const plans = getPricingPlans(locale);
  const matrixSections = getPricingMatrixSections(locale);
  const aiFeatures = getPricingAiFeatures(locale);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl">
        <section className="px-5 pt-16 pb-10 sm:px-8 sm:pt-20 sm:pb-12 lg:px-10">
          <div className="max-w-3xl space-y-5">
            <TypographyH1>{copy.headline}</TypographyH1>
            <TypographyP size="large" tone="subtle">
              {copy.subcopy}
            </TypographyP>
          </div>
        </section>

        <section className="border-t border-border px-5 sm:px-8 lg:px-10 xl:px-0">
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

        <section className="border-t border-border">
          <div className="px-5 py-12 sm:px-8 sm:py-14 lg:px-10">
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
