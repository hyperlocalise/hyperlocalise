import { useCasePagesBySlug } from "@/components/marketing/use-case";
import {
  createMarketingOgImage,
  marketingOgImageContentType,
  marketingOgImageSize,
  toMarketingOgHeading,
} from "@/lib/og/create-marketing-og-image";

export const alt = "Hyperlocalise";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

type UseCaseOgImageProps = {
  params: Promise<{ slug: string }>;
};

export default async function Image({ params }: UseCaseOgImageProps) {
  const { slug } = await params;
  const content = useCasePagesBySlug[slug];

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
