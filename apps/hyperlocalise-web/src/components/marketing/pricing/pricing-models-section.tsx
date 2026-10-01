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
import { Rows } from "@/components/ui/layout/rows";
import { TypographyH2, TypographyP } from "@/components/ui/typography";

import { PricingModelsBrowser } from "./pricing-models-browser";
import type { PricingModelsSectionContent } from "./pricing-page-content";

type PricingModelsSectionProps = PricingModelsSectionContent;

export function PricingModelsSection({ heading, subcopy, ...browser }: PricingModelsSectionProps) {
  return (
    <section aria-labelledby="pricing-models-heading">
      <Rows spacing="6u">
        <div className="max-w-2xl">
          <Rows spacing="1.5u">
            <TypographyH2
              className="pb-0 text-3xl leading-tight tracking-[-0.03em] text-balance sm:text-4xl md:text-4xl"
              id="pricing-models-heading"
            >
              {heading}
            </TypographyH2>
            <TypographyP className="text-pretty sm:text-lg" tone="subtle">
              {subcopy}
            </TypographyP>
          </Rows>
        </div>
        <PricingModelsBrowser {...browser} />
      </Rows>
    </section>
  );
}
