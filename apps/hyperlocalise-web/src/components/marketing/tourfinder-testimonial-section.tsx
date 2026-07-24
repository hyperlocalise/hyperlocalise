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
import Image from "next/image";
import { FormattedMessage, useIntl } from "react-intl";

import { TypographyH2, TypographyP } from "@/components/ui/typography";

import { tourfinderTestimonialSectionMessages } from "./tourfinder-testimonial-section.messages";

export function TourfinderTestimonialSection() {
  const intl = useIntl();

  return (
    <section id="customers" aria-labelledby="tourfinder-testimonial-heading">
      <div className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-background text-foreground">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-32">
          <div className="max-w-3xl">
            <p className="text-[0.72rem] font-medium tracking-[0.16em] text-muted-foreground uppercase">
              <FormattedMessage {...tourfinderTestimonialSectionMessages.eyebrow} />
            </p>

            <TypographyH2
              id="tourfinder-testimonial-heading"
              className="mt-5 pb-0 text-left text-[2.25rem] leading-[1.04] font-semibold tracking-[-0.045em] text-foreground normal-case sm:mt-6 sm:text-5xl md:text-[3.5rem] md:leading-[1.02]"
            >
              <FormattedMessage {...tourfinderTestimonialSectionMessages.headline} />
            </TypographyH2>

            <TypographyP className="mt-6 max-w-2xl pb-0 text-pretty text-[1.15rem] leading-relaxed text-muted-foreground sm:mt-8 sm:text-[1.35rem] sm:leading-[1.4]">
              <FormattedMessage {...tourfinderTestimonialSectionMessages.result} />
            </TypographyP>

            <a
              href="https://tourfinder.vn"
              target="_blank"
              rel="noopener noreferrer"
              className="group/link mt-8 inline-flex items-center gap-3 sm:mt-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Image
                src="/images/customers/tourfinder-logo.png"
                alt={intl.formatMessage(tourfinderTestimonialSectionMessages.logoAlt)}
                width={1177}
                height={294}
                className="h-6 w-auto grayscale transition-[filter] duration-500 ease-out motion-reduce:transition-none group-hover/link:grayscale-0 group-focus-visible/link:grayscale-0 sm:h-7"
              />
              <span className="text-[0.9rem] font-medium text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors group-hover/link:decoration-foreground">
                <FormattedMessage {...tourfinderTestimonialSectionMessages.visitSite} />
              </span>
            </a>
          </div>

          <a
            href="https://tourfinder.vn"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative mt-12 block overflow-hidden rounded-2xl border border-border bg-muted shadow-[0_36px_110px_color-mix(in_srgb,var(--foreground)_16%,transparent)] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:mt-16 lg:mt-20"
          >
            <div
              className="flex items-center gap-2 border-b border-border/80 bg-muted/80 px-4 py-3"
              aria-hidden
            >
              <span className="size-2.5 rounded-full bg-foreground/15" />
              <span className="size-2.5 rounded-full bg-foreground/15" />
              <span className="size-2.5 rounded-full bg-foreground/15" />
              <span className="ml-3 truncate text-[0.7rem] tracking-wide text-muted-foreground">
                tourfinder.vn
              </span>
            </div>
            <Image
              src="/images/customers/tourfinder-vn.png"
              alt={intl.formatMessage(tourfinderTestimonialSectionMessages.imageAlt)}
              width={1440}
              height={900}
              className="h-auto w-full grayscale transition-[filter] duration-700 ease-out motion-reduce:transition-none group-hover:grayscale-0 group-focus-visible:grayscale-0"
              sizes="(min-width: 1280px) 1120px, 100vw"
            />
          </a>
        </div>
      </div>
    </section>
  );
}
