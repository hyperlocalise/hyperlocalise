import { productPagesBySlug } from "@/components/marketing/product";
import { getIntlShape } from "@/lib/app-i18n/intl";
import {
  createMarketingOgImage,
  marketingOgImageContentType,
  marketingOgImageSize,
  toMarketingOgHeading,
} from "@/lib/og/create-marketing-og-image";

import { getProductRouteMetadata } from "./product-route-metadata";

export const alt = "Hyperlocalise";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

type ProductOgImageProps = {
  params: Promise<{ lang: string; slug: string }>;
};

export default async function Image({ params }: ProductOgImageProps) {
  const { lang, slug } = await params;
  const intl = getIntlShape(lang);
  const content = productPagesBySlug[slug as keyof typeof productPagesBySlug];

  if (!content) {
    return createMarketingOgImage({
      heading: "Hyperlocalise",
      description: intl.formatMessage({
        defaultMessage: "Localisation for the Agentic Era.",
        id: "jycg40Y0pj",
        description: "Open Graph fallback description for unknown pages",
      }),
    });
  }

  const metadata = getProductRouteMetadata(slug, intl);

  if (!metadata) {
    return createMarketingOgImage({
      heading: "Hyperlocalise",
      description: intl.formatMessage({
        defaultMessage: "Localisation for the Agentic Era.",
        id: "jycg40Y0pj",
        description: "Open Graph fallback description for unknown pages",
      }),
    });
  }

  return createMarketingOgImage({
    heading: toMarketingOgHeading(metadata.title),
    description: metadata.description,
  });
}
