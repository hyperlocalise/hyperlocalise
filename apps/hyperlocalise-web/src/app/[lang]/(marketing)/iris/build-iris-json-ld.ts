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
import type { SoftwareApplication, WithContext } from "schema-dts";

import { getIntlShape } from "@/lib/app-i18n/intl";
import type { AppLocale } from "@/lib/app-i18n/locales";
import { jsonLdInLanguage } from "@/lib/seo/json-ld-in-language";
import { SITE_URL } from "@/lib/seo/site-url";

import { getIrisRouteMetadata } from "./iris-route-metadata";

export function buildIrisJsonLd(locale: AppLocale): WithContext<SoftwareApplication> {
  const intl = getIntlShape(locale);
  const metadata = getIrisRouteMetadata(intl);

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Iris",
    alternateName: intl.formatMessage({
      defaultMessage: "Iris by Hyperlocalise",
      id: "VxlBCadoU8",
      description: "Alternate schema.org name for the Iris product",
    }),
    description: metadata.description,
    featureList: [
      intl.formatMessage({
        defaultMessage: "Multilingual image localisation",
        id: "TFy71zYatd",
        description: "Iris schema.org feature for image localisation",
      }),
      intl.formatMessage({
        defaultMessage: "Video localisation",
        id: "pPaYbj0Q2H",
        description: "Iris schema.org feature for video localisation",
      }),
      intl.formatMessage({
        defaultMessage: "Motion localisation",
        id: "H/6Z4vWchC",
        description: "Iris schema.org feature for motion localisation",
      }),
      intl.formatMessage({
        defaultMessage: "Audio localisation",
        id: "YhXUDTQkrZ",
        description: "Iris schema.org feature for audio localisation",
      }),
    ],
    inLanguage: jsonLdInLanguage(locale),
    url: `${SITE_URL}/${locale}/iris`,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Cloud",
    provider: {
      "@type": "Organization",
      name: "Hyperlocalise",
      url: SITE_URL,
    },
  };
}
