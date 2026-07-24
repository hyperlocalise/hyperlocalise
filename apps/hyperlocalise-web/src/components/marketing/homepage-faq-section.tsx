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
import { Add01Icon, ArrowUpRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import type { HomepageFaqItem } from "@/components/marketing/homepage-faq-content";
import { contactUrl } from "@/components/marketing/marketing-page-content";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { TypographyH2 } from "@/components/ui/typography";

import { homepageFaqSectionMessages } from "./homepage-faq-section.messages";

type HomepageFaqSectionProps = {
  items: readonly HomepageFaqItem[];
};

export function HomepageFaqSection({ items }: HomepageFaqSectionProps) {
  return (
    <section
      id="faq"
      aria-labelledby="homepage-faq-heading"
      className="grid gap-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-stretch lg:gap-20 xl:gap-28"
    >
      <div className="flex flex-col justify-between gap-16 lg:min-h-[32rem] lg:py-2">
        <div className="max-w-md">
          <TypographyH2
            id="homepage-faq-heading"
            className="pb-0 text-balance text-[clamp(2.75rem,6vw,4.5rem)] leading-[1.02] font-semibold tracking-[-0.04em] normal-case text-foreground"
          >
            <FormattedMessage {...homepageFaqSectionMessages.heading} />
          </TypographyH2>
          <p className="mt-4 font-sans text-2xl font-medium tracking-tight text-muted-foreground sm:text-3xl">
            <FormattedMessage {...homepageFaqSectionMessages.subheading} />
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <FormattedMessage {...homepageFaqSectionMessages.moreQuestions} />
          </p>
          <a
            href={contactUrl}
            className="group/contact inline-flex items-center gap-3 rounded-sm text-base font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <FormattedMessage {...homepageFaqSectionMessages.contactUs} />
            <span
              aria-hidden
              className="inline-flex size-7 items-center justify-center rounded-full border border-border text-foreground transition-colors group-hover/contact:border-foreground group-hover/contact:bg-foreground group-hover/contact:text-background"
            >
              <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} className="size-3.5" />
            </span>
          </a>
        </div>
      </div>

      <Accordion className="rounded-none border-0 bg-transparent">
        {items.map((item, index) => (
          <AccordionItem
            key={item.question}
            value={`faq-${index + 1}`}
            className="border-border data-open:bg-transparent not-last:border-b last:border-b"
          >
            <AccordionTrigger
              className={[
                "gap-8 px-0 py-7 text-[1.05rem] leading-snug font-medium tracking-tight hover:no-underline sm:py-8 sm:text-xl",
                "**:data-[slot=accordion-trigger-icon]:hidden",
              ].join(" ")}
            >
              <span className="pe-2">{item.question}</span>
              <span className="ms-auto inline-flex size-5 shrink-0 items-center justify-center text-foreground">
                <HugeiconsIcon
                  icon={Add01Icon}
                  strokeWidth={2}
                  className="size-5 group-aria-expanded/accordion-trigger:hidden"
                  aria-hidden
                />
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  strokeWidth={2}
                  className="hidden size-5 group-aria-expanded/accordion-trigger:inline"
                  aria-hidden
                />
              </span>
            </AccordionTrigger>
            <AccordionContent className="max-w-2xl px-0 pb-7 text-pretty text-[0.95rem] leading-7 text-muted-foreground sm:pb-8 sm:text-base">
              <p>{item.answer}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
