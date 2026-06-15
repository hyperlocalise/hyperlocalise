import { productPagesBySlug } from "@/components/marketing/product";
import {
  createMarketingOgImage,
  marketingOgImageContentType,
  marketingOgImageSize,
  toMarketingOgHeading,
} from "@/lib/og/create-marketing-og-image";

export const alt = "Hyperlocalise";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

type ProductOgImageProps = {
  params: Promise<{ slug: string }>;
};

export default async function Image({ params }: ProductOgImageProps) {
  const { slug } = await params;
  const content = productPagesBySlug[slug as keyof typeof productPagesBySlug];

  if (!content) {
    return createMarketingOgImage({
      heading: "Hyperlocalise",
      description: "Localisation for the Agentic Era.",
    });
  }

  return createMarketingOgImage({
    heading: toMarketingOgHeading(content.metadata.title),
    description: content.metadata.description,
  });
}
