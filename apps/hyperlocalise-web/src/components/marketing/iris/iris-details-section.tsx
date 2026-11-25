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
import { AppleLogoIcon, CoinsIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import type { MessageDescriptor } from "react-intl";
import { FormattedMessage } from "react-intl";

import { IrisAvailabilityNote } from "./download-iris-button";
import { irisDetailsSectionMessages as m } from "./iris-details-section.messages";
import { IrisDownloadCta } from "./iris-download-cta";
import type { HomepageFaqItem } from "@/components/marketing/homepage-faq-content";
import { HomepageFaqSection } from "@/components/marketing/homepage-faq-section";
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";

const SECTION_CLASS = "mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10";

const CAPABILITIES: { title: MessageDescriptor; body: MessageDescriptor }[] = [
  { title: m.capabilityImagesTitle, body: m.capabilityImagesBody },
  { title: m.capabilityVideoTitle, body: m.capabilityVideoBody },
  { title: m.capabilityVoiceTitle, body: m.capabilityVoiceBody },
  { title: m.capabilityLayoutTitle, body: m.capabilityLayoutBody },
];

export function IrisDetailsSection({ faqItems }: { faqItems: readonly HomepageFaqItem[] }) {
  const locale = useAppLocale();
  const pricingHref = rewriteAppLocalePath("/pricing", locale);

  const essentials = [
    { icon: AppleLogoIcon, title: m.platformTitle, body: m.platformBody },
    { icon: DownloadSimpleIcon, title: m.priceTitle, body: m.priceBody },
    { icon: CoinsIcon, title: m.creditTitle, body: m.creditBody, link: true },
  ];

  return (
    <div className="bg-background text-foreground">
      <section aria-labelledby="iris-intro-heading" className={SECTION_CLASS}>
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <p className="text-xs font-medium text-muted-foreground">
            <FormattedMessage {...m.introEyebrow} />
          </p>
          <h2
            id="iris-intro-heading"
            className="font-heading text-[clamp(2.25rem,4vw,3.5rem)] leading-[1.1] text-balance"
          >
            <FormattedMessage {...m.introTitle} />
          </h2>
          <p className="max-w-2xl text-base leading-7 text-pretty text-muted-foreground">
            <FormattedMessage {...m.introBody} />
          </p>
        </div>
        <ul className="mt-14 grid gap-x-8 gap-y-10 sm:mt-20 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((item) => (
            <li key={item.title.id} className="flex flex-col gap-2 border-t border-border pt-5">
              <h3 className="text-base font-semibold leading-snug text-balance">
                <FormattedMessage {...item.title} />
              </h3>
              <p className="text-sm leading-6 text-pretty text-muted-foreground">
                <FormattedMessage {...item.body} />
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="iris-plans-heading" className="bg-muted">
        <div className={SECTION_CLASS}>
          <h2
            id="iris-plans-heading"
            className="mb-10 text-center font-heading text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.15] text-balance sm:mb-14"
          >
            <FormattedMessage {...m.plansTitle} />
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {essentials.map(({ icon: Icon, title, body, link }) => (
              <li
                key={title.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-background p-6"
              >
                <Icon aria-hidden className="size-6 text-muted-foreground" weight="duotone" />
                <h3 className="text-lg font-medium">
                  <FormattedMessage {...title} />
                </h3>
                <p className="text-sm leading-6 text-pretty text-muted-foreground">
                  <FormattedMessage {...body} />
                </p>
                {link ? (
                  <Link
                    className="mt-auto rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
                    href={pricingHref}
                  >
                    <FormattedMessage {...m.seePricing} /> <span aria-hidden>↗</span>
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mx-auto max-w-7xl">
        <div className="px-5 py-24 sm:px-8 sm:py-28 lg:px-10">
          <HomepageFaqSection heading={<FormattedMessage {...m.faqHeading} />} items={faqItems} />
        </div>
      </div>

      <section aria-labelledby="iris-closing-heading" className="border-t border-border bg-muted">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-5 py-24 text-center sm:px-8 sm:py-28 lg:px-10">
          <h2
            id="iris-closing-heading"
            className="max-w-3xl font-heading text-[clamp(2.25rem,4vw,3.5rem)] leading-[1.1] text-balance"
          >
            <FormattedMessage {...m.closingTitle} />
          </h2>
          <IrisDownloadCta source="iris_closing" />
          <IrisAvailabilityNote className="text-muted-foreground" />
        </div>
      </section>
    </div>
  );
}
