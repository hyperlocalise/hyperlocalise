import {
  createMarketingOgImage,
  marketingOgImageContentType,
  marketingOgImageSize,
} from "@/lib/og/create-marketing-og-image";

export const alt = "Hyperlocalise privacy policy";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

export default async function Image() {
  return createMarketingOgImage({
    heading: "Privacy policy",
    description: "How Hyperlocalise handles account, usage, and provider-related data.",
  });
}
