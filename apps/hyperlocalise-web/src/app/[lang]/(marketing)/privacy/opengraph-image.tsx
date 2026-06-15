import { getIntlShape } from "@/lib/app-i18n/intl";
import {
  createMarketingOgImage,
  marketingOgImageContentType,
  marketingOgImageSize,
} from "@/lib/og/create-marketing-og-image";

export const alt = "Hyperlocalise privacy policy";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

type PrivacyOgImageProps = {
  params: Promise<{ lang: string }>;
};

export default async function Image({ params }: PrivacyOgImageProps) {
  const { lang } = await params;
  const intl = getIntlShape(lang);

  const heading = intl.formatMessage({
    defaultMessage: "Privacy policy",
    id: "HPcVVY4tmz",
    description: "Open Graph heading for the privacy policy page",
  });
  const description = intl.formatMessage({
    defaultMessage: "How Hyperlocalise handles account, usage, and provider-related data.",
    id: "q9M+h9o1YI",
    description: "Open Graph description for the privacy policy page",
  });

  return createMarketingOgImage({
    heading,
    description,
  });
}
