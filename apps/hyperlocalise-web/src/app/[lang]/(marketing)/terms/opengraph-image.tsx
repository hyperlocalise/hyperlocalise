import {
  createMarketingOgImage,
  marketingOgImageContentType,
  marketingOgImageSize,
} from "@/lib/og/create-marketing-og-image";

export const alt = "Hyperlocalise terms of service";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

export default async function Image() {
  return createMarketingOgImage({
    heading: "Terms of service",
    description:
      "The baseline terms that govern use of Hyperlocalise websites, docs, and services.",
  });
}
