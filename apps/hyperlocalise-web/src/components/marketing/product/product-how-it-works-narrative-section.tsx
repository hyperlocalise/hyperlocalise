"use client";

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
import type { MessageDescriptor } from "@formatjs/intl";
import { FormattedMessage } from "react-intl";

import { productHowItWorksNarrativeSectionMessages } from "./product-how-it-works-narrative-section.messages";

type ProductHowItWorksNarrativeSectionProps = {
  narrative: MessageDescriptor;
};

export function ProductHowItWorksNarrativeSection({
  narrative,
}: ProductHowItWorksNarrativeSectionProps) {
  return (
    <section
      aria-labelledby="product-how-it-works-narrative"
      className="border-t border-border bg-muted/30 px-5 py-20 sm:px-8 lg:px-10 lg:py-24"
    >
      <div className="mx-auto max-w-3xl">
        <p
          id="product-how-it-works-narrative"
          className="text-xs font-semibold tracking-[0.18em] text-primary uppercase"
        >
          <FormattedMessage {...productHowItWorksNarrativeSectionMessages.eyebrow} />
        </p>
        <div className="mt-6 space-y-6 text-lg leading-8 text-pretty text-muted-foreground sm:text-xl sm:leading-9">
          <p className="whitespace-pre-line">
            <FormattedMessage {...narrative} />
          </p>
        </div>
      </div>
    </section>
  );
}
