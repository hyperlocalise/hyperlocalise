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
import type { Metadata } from "next";

import {
  buildPricingFaqJsonLd,
  getPricingFaqItems,
} from "@/components/marketing/pricing/pricing-faq-content";
import { PricingPage } from "@/components/marketing/pricing/pricing-page";
import { JsonLd } from "@/components/seo/json-ld";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { getLocalizedAlternates } from "@/lib/seo/localized-alternates";

import { getPricingRouteMetadata } from "./pricing-route-metadata";

type PricingRouteProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: PricingRouteProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const intl = getIntlShape(locale);
  const metadata = getPricingRouteMetadata(intl);

  return {
    title: metadata.title,
    description: metadata.description,
    alternates: getLocalizedAlternates({ locale, path: "/pricing" }),
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      type: "website",
    },
  };
}

export default async function PricingRoutePage({ params }: PricingRouteProps) {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const faqItems = getPricingFaqItems(locale);
  const faqJsonLd = buildPricingFaqJsonLd(faqItems);

  return (
    <>
      <JsonLd data={faqJsonLd} />
      <PricingPage locale={locale} faqItems={faqItems} />
    </>
  );
}
