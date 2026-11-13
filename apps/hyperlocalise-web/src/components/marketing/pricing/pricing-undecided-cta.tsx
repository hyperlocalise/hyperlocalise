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
"use client";

import Link from "next/link";

import { MeshStage, SEAFOAM_MESH_GRADIENT_SRC } from "@/components/marketing/hero-frame-mesh-stage";
import { contactUrl } from "@/components/marketing/marketing-page-content";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { TypographyH2 } from "@/components/ui/typography";
import { trackMarketingCtaClick } from "@/lib/analytics/marketing-cta";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";

import { CurrencyGlyphField } from "./pricing-hero-visual";

type PricingUndecidedCtaProps = {
  heading: string;
  talkToSalesLabel: string;
  requestDemoLabel: string;
  locale: string;
};

export function PricingUndecidedCta({
  heading,
  talkToSalesLabel,
  requestDemoLabel,
  locale,
}: PricingUndecidedCtaProps) {
  const appLocale = normalizeAppLocale(locale) ?? DEFAULT_APP_LOCALE;

  return (
    <MeshStage
      meshSrc={SEAFOAM_MESH_GRADIENT_SRC}
      entranceAnimation="fade"
      contentClassName="p-0 sm:p-0 lg:p-0 xl:p-0"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0b3b3a]/55 via-[#0b3b3a]/20 to-transparent"
      />
      <CurrencyGlyphField />
      <section
        aria-labelledby="pricing-undecided-heading"
        className="relative flex flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-12 sm:py-16"
      >
        <TypographyH2
          id="pricing-undecided-heading"
          className="pb-0 text-3xl leading-tight tracking-[-0.03em] text-white sm:text-4xl md:text-5xl"
        >
          {heading}
        </TypographyH2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            size="lg"
            variant="outline"
            className="border-white/40 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 hover:text-white"
            nativeButton={false}
            render={<Link href={rewriteAppLocalePath(contactUrl, appLocale)} />}
            onClick={() => trackMarketingCtaClick("contact", "pricing")}
          >
            {talkToSalesLabel}
          </Button>
          <Button
            size="lg"
            className="bg-white text-foreground hover:bg-white/90 dark:bg-white dark:text-black"
            nativeButton={false}
            render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
            onClick={() => trackMarketingCtaClick("request_demo", "pricing")}
          >
            {requestDemoLabel}
          </Button>
        </div>
      </section>
    </MeshStage>
  );
}
