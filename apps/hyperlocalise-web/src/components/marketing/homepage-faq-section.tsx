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
import { FormattedMessage } from "react-intl";

import type { HomepageFaqItem } from "@/components/marketing/homepage-faq-content";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { TypographyH2, TypographyP } from "@/components/ui/typography";

import { homepageFaqSectionMessages } from "./homepage-faq-section.messages";

type HomepageFaqSectionProps = {
  items: readonly HomepageFaqItem[];
};

export function HomepageFaqSection({ items }: HomepageFaqSectionProps) {
  return (
    <section
      id="faq"
      aria-labelledby="homepage-faq-heading"
      className="grid gap-12 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-20"
    >
      <div className="max-w-xl lg:pt-5">
        <TypographyP className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          <FormattedMessage {...homepageFaqSectionMessages.eyebrow} />
        </TypographyP>
        <TypographyH2
          id="homepage-faq-heading"
          className="pt-3 pb-0 text-balance text-4xl font-semibold tracking-[-0.04em] normal-case text-foreground sm:text-5xl"
        >
          <FormattedMessage {...homepageFaqSectionMessages.heading} />
        </TypographyH2>
        <TypographyP className="mt-5 max-w-md text-pretty text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
          <FormattedMessage {...homepageFaqSectionMessages.description} />
        </TypographyP>
      </div>

      <Accordion className="rounded-none border-x-0 bg-transparent">
        {items.map((item, index) => (
          <AccordionItem
            key={item.question}
            value={`faq-${index + 1}`}
            className="data-open:bg-transparent"
          >
            <AccordionTrigger className="px-0 py-6 text-base leading-6 font-medium hover:no-underline sm:py-7 sm:text-lg">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="max-w-2xl px-0 pb-6 text-pretty text-sm leading-6 text-muted-foreground sm:pb-7 sm:text-[0.95rem]">
              <p>{item.answer}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
