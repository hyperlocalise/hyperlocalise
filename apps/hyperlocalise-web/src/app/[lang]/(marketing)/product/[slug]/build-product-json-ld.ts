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
import type { MessageDescriptor } from "@formatjs/intl";
import type { SoftwareApplication, WithContext } from "schema-dts";

import type { ProductPageSlug } from "@/components/marketing/product/product-page-content";
import { getIntlShape } from "@/lib/app-i18n/intl";
import type { AppLocale } from "@/lib/app-i18n/locales";
import { jsonLdInLanguage } from "@/lib/seo/json-ld-in-language";
import { SITE_URL } from "@/lib/seo/site-url";

import { getProductRouteMetadata } from "./product-route-metadata";

type ProductJsonLdCopy = {
  headline: MessageDescriptor;
  features: MessageDescriptor[];
};

function normalizeSchemaText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const productJsonLdCopy: Record<ProductPageSlug, ProductJsonLdCopy> = {
  "agents-automation": {
    headline: {
      defaultMessage: "The workflow for multilingual content operations.",
      id: "TGHvKVZXDF",
      description: "Hero headline for the agents automation product page",
    },
    features: [
      {
        defaultMessage: "Create the workflow",
        id: "IUbDcw9z2P",
        description: "Proof point 1 title for the agents automation product page",
      },
      {
        defaultMessage: "It runs in every language",
        id: "9QrrRor3/1",
        description: "Proof point 2 title for the agents automation product page",
      },
      {
        defaultMessage: "It lands back in your tools",
        id: "X0QoMyZV2K",
        description: "Proof point 3 title for the agents automation product page",
      },
    ],
  },
  "multilingual-content-studio": {
    headline: {
      defaultMessage: "One workspace.\nEvery language.",
      id: "PsuANqhGSg",
      description: "Hero headline for the multilingual Content Studio product page",
    },
    features: [
      {
        defaultMessage: "Text & documents",
        id: "hj+HpjmXDL",
        description: "Content Studio format tab for text and documents",
      },
      {
        defaultMessage: "Slides",
        id: "ceF41648YF",
        description: "Content Studio format tab for slides",
      },
      {
        defaultMessage: "Images",
        id: "gMIZAR6HUF",
        description: "Content Studio format tab for images",
      },
      {
        defaultMessage: "Video",
        id: "iqtybHn407",
        description: "Content Studio format tab for video",
      },
    ],
  },
  guidelines: {
    headline: {
      defaultMessage: "Keep the docs you have.\nPut them to work.",
      id: "sMO5kn7k5p",
      description: "Hero headline for the Guidelines product page",
    },
    features: [
      {
        defaultMessage: "Google Drive",
        id: "I4iH2T3OLx",
        description: "Guidelines source tab for Google Drive",
      },
      {
        defaultMessage: "Notion",
        id: "4nr1WS9kIp",
        description: "Guidelines source tab for Notion",
      },
      {
        defaultMessage: "SharePoint",
        id: "1kGndGN4wG",
        description: "Guidelines source tab for SharePoint",
      },
    ],
  },
  domains: {
    headline: {
      defaultMessage: "Publish once.\nGet found everywhere.",
      id: "BbOj+wUXk0",
      description: "Hero headline for the Domains product page",
    },
    features: [
      {
        defaultMessage: "Every language",
        id: "aFsNlAnIlu",
        description: "Domains solution tab for localisation",
      },
      {
        defaultMessage: "Search",
        id: "f46AmI9URt",
        description: "Domains solution tab for SEO",
      },
      {
        defaultMessage: "AI answers",
        id: "w/OKtwjgIh",
        description: "Domains solution tab for AEO",
      },
    ],
  },
  hyperlab: {
    headline: {
      defaultMessage: "Try it in one market.\nKeep what works.",
      id: "AvgC2HJ861",
      description: "Hero headline for the Hyperlab product page",
    },
    features: [
      {
        defaultMessage: "Different by market",
        id: "p5qwf5gg9T",
        description: "Hyperlab solution tab for flags",
      },
      {
        defaultMessage: "Test in one market",
        id: "gTXaucscnP",
        description: "Hyperlab solution tab for experiments",
      },
      {
        defaultMessage: "Then take it further",
        id: "9VqlLubKvR",
        description: "Hyperlab solution tab for audiences",
      },
    ],
  },
};

export function buildProductJsonLd(
  slug: ProductPageSlug,
  locale: AppLocale,
): WithContext<SoftwareApplication> {
  const intl = getIntlShape(locale);
  const metadata = getProductRouteMetadata(slug, intl);

  if (!metadata) {
    throw new Error(`Missing product metadata for slug: ${slug}`);
  }

  const copy = productJsonLdCopy[slug];

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: normalizeSchemaText(intl.formatMessage(copy.headline)),
    description: metadata.description,
    featureList: copy.features.map((descriptor) =>
      normalizeSchemaText(intl.formatMessage(descriptor)),
    ),
    inLanguage: jsonLdInLanguage(locale),
    url: `${SITE_URL}/${locale}/product/${slug}`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Cloud",
    provider: {
      "@type": "Organization",
      name: "Hyperlocalise",
      url: SITE_URL,
    },
  };
}
