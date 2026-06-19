import { getIntlShape } from "@/lib/app-i18n/intl";
import {
  createMarketingOgImage,
  marketingOgImageContentType,
  marketingOgImageSize,
  toMarketingOgHeading,
} from "@/lib/og/create-marketing-og-image";

import { getBlogRouteMetadata } from "./blog-route-metadata";

export const alt = "Hyperlocalise Blog";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

type BlogIndexOgImageProps = {
  params: Promise<{ lang: string }>;
};

export default async function Image({ params }: BlogIndexOgImageProps) {
  const { lang } = await params;
  const intl = getIntlShape(lang);
  const metadata = getBlogRouteMetadata(intl);

  return createMarketingOgImage({
    heading: toMarketingOgHeading(metadata.title),
    description: metadata.description,
  });
}
