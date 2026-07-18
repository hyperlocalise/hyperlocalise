"use client";

import Image from "next/image";
import { FormattedMessage, useIntl } from "react-intl";

import { TypographyH2, TypographyP } from "@/components/ui/typography";

import { tourfinderTestimonialSectionMessages } from "./tourfinder-testimonial-section.messages";

const features = [
  tourfinderTestimonialSectionMessages.featureVietnamese,
  tourfinderTestimonialSectionMessages.featureJapanese,
  tourfinderTestimonialSectionMessages.featureReview,
  tourfinderTestimonialSectionMessages.featureSpeed,
] as const;

export function TourfinderTestimonialSection() {
  const intl = useIntl();

  return (
    <section id="customers" aria-labelledby="tourfinder-testimonial-heading">
      <div className="relative left-1/2 w-screen -translate-x-1/2 bg-black text-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
          <TypographyH2
            id="tourfinder-testimonial-heading"
            className="mx-auto max-w-4xl pb-0 text-center text-[1.85rem] leading-[1.12] font-semibold tracking-[-0.04em] text-white normal-case sm:text-4xl md:text-5xl"
          >
            <FormattedMessage {...tourfinderTestimonialSectionMessages.headline} />
          </TypographyH2>

          <div className="mt-14 grid items-center gap-10 lg:mt-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
            <div className="space-y-10">
              <TypographyP className="max-w-xl text-pretty text-[1.35rem] leading-[1.35] font-medium tracking-[-0.03em] text-white sm:text-[1.65rem] sm:leading-[1.3]">
                <FormattedMessage {...tourfinderTestimonialSectionMessages.quote} />
              </TypographyP>

              <div>
                <TypographyP className="text-[0.68rem] font-semibold tracking-[0.22em] text-white/45 uppercase">
                  <FormattedMessage {...tourfinderTestimonialSectionMessages.featuresLabel} />
                </TypographyP>
                <ul className="mt-4 space-y-2.5">
                  {features.map((feature) => (
                    <li
                      key={feature.id}
                      className="text-[0.78rem] font-semibold tracking-[0.14em] text-white uppercase sm:text-[0.82rem]"
                    >
                      <FormattedMessage {...feature} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <a
              href="https://tourfinder.vn"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              <Image
                src="/images/customers/tourfinder-vn.png"
                alt={intl.formatMessage(tourfinderTestimonialSectionMessages.imageAlt)}
                width={1440}
                height={900}
                className="h-auto w-full grayscale transition-[filter] duration-500 ease-out motion-reduce:transition-none group-hover:grayscale-0 group-focus-visible:grayscale-0"
                sizes="(min-width: 1024px) 560px, 100vw"
              />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
