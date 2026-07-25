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
import { contactUrl } from "@/components/marketing/marketing-page-content";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { TypographyH2 } from "@/components/ui/typography";

type PricingUndecidedCtaProps = {
  heading: string;
  talkToSalesLabel: string;
  requestDemoLabel: string;
};

export function PricingUndecidedCta({
  heading,
  talkToSalesLabel,
  requestDemoLabel,
}: PricingUndecidedCtaProps) {
  return (
    <section
      aria-labelledby="pricing-undecided-heading"
      className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <TypographyH2
        id="pricing-undecided-heading"
        className="pb-0 text-3xl leading-tight tracking-[-0.03em] sm:text-4xl md:text-4xl"
      >
        {heading}
      </TypographyH2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button variant="outline" nativeButton={false} render={<a href={contactUrl} />}>
          {talkToSalesLabel}
        </Button>
        <Button
          nativeButton={false}
          render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
        >
          {requestDemoLabel}
        </Button>
      </div>
    </section>
  );
}
