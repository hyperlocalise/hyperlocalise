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
import type { BreadcrumbList, FAQPage, WithContext } from "schema-dts";

import type { MarketingIntegration } from "@/components/marketing/integrations/integrations-page-content";
import { getIntegrationDetailCopy } from "@/components/marketing/integrations/integrations-page-content";
import type { AppLocale } from "@/lib/app-i18n/locales";
import { jsonLdInLanguage } from "@/lib/seo/json-ld-in-language";
import { getLocalizedAbsoluteUrl } from "@/lib/seo/localized-alternates";

export function buildIntegrationFaqJsonLd(
  locale: AppLocale,
  integration: MarketingIntegration,
): WithContext<FAQPage> | null {
  if (integration.faqs.length === 0) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: jsonLdInLanguage(locale),
    mainEntity: integration.faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function buildIntegrationBreadcrumbJsonLd(
  locale: AppLocale,
  integration: MarketingIntegration,
): WithContext<BreadcrumbList> {
  const copy = getIntegrationDetailCopy(locale);

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: copy.backToIntegrations,
        item: getLocalizedAbsoluteUrl(locale, "/integrations"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: integration.name,
        item: getLocalizedAbsoluteUrl(locale, `/integrations/${integration.slug}`),
      },
    ],
  };
}
