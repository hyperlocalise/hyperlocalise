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
import type { WebApplication, WithContext } from "schema-dts";

import { getIntlShape } from "@/lib/app-i18n/intl";
import type { AppLocale } from "@/lib/app-i18n/locales";
import { ORGANIZATION_JSON_LD_ID } from "@/components/seo/organization-json-ld";
import { jsonLdInLanguage } from "@/lib/seo/json-ld-in-language";
import { getLocalizedAbsoluteUrl } from "@/lib/seo/localized-alternates";

export function buildHomeJsonLd(locale: AppLocale): WithContext<WebApplication> & object {
  const intl = getIntlShape(locale);

  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    inLanguage: jsonLdInLanguage(locale),
    name: "Hyperlocalise",
    url: getLocalizedAbsoluteUrl(locale, "/"),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Cloud",
    offers: {
      "@type": "Offer",
      category: intl.formatMessage({
        defaultMessage: "Free",
        id: "8FzJDvElQ4",
        description: "Schema.org offer category indicating a free tier on the marketing homepage",
      }),
      availability: "https://schema.org/InStock",
    },
    provider: { "@id": ORGANIZATION_JSON_LD_ID },
  };
}
