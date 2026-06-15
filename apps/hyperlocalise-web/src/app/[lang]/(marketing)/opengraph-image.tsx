import { getIntlShape } from "@/lib/app-i18n/intl";
import {
  createMarketingOgImage,
  marketingOgImageContentType,
  marketingOgImageSize,
  toMarketingOgHeading,
} from "@/lib/og/create-marketing-og-image";

export const alt = "Hyperlocalise";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

type HomeOgImageProps = {
  params: Promise<{ lang: string }>;
};

export default async function Image({ params }: HomeOgImageProps) {
  const { lang } = await params;
  const intl = getIntlShape(lang);

  const title = intl.formatMessage({
    defaultMessage: "Hyperlocalise | Localisation Platform for the Agentic Era",
    id: "RZBs1fe1V3",
    description: "Page title for the marketing homepage",
  });
  const description = intl.formatMessage({
    defaultMessage:
      "Assign AI agents to translate, review, and sync content while keeping human review first-class.",
    id: "D3VzMQGhqa",
    description:
      "Open Graph meta description for the marketing homepage (shorter than the main description)",
  });

  return createMarketingOgImage({
    heading: toMarketingOgHeading(title),
    description,
  });
}
