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
import { TypographyH2, TypographyP } from "@/components/ui/typography";

import type { PricingAiFeature } from "./pricing-page-content";

type PricingAiFeaturesSectionProps = {
  heading: string;
  subcopy: string;
  features: readonly PricingAiFeature[];
};

export function PricingAiFeaturesSection({
  heading,
  subcopy,
  features,
}: PricingAiFeaturesSectionProps) {
  return (
    <section aria-labelledby="pricing-ai-features-heading" className="space-y-10">
      <div className="max-w-2xl">
        <TypographyH2
          id="pricing-ai-features-heading"
          className="pb-0 text-3xl leading-tight tracking-[-0.03em] sm:text-4xl md:text-4xl"
        >
          {heading}
        </TypographyH2>
        <TypographyP className="mt-3 sm:text-lg" tone="subtle">
          {subcopy}
        </TypographyP>
      </div>

      <ul className="divide-y divide-border border-t border-border">
        {features.map((feature) => (
          <li
            key={feature.id}
            className="grid gap-1 py-5 sm:grid-cols-[minmax(12rem,0.9fr)_minmax(0,1.4fr)] sm:items-baseline sm:gap-8"
          >
            <p className="text-sm font-semibold text-foreground sm:text-base">{feature.title}</p>
            <p className="text-sm text-muted-foreground sm:text-base">{feature.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
