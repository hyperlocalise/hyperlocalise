import { getIntlShape } from "@/lib/app-i18n/intl";
import { getPostBySlug } from "@/lib/blog/blog-post";
import {
  createMarketingOgImage,
  marketingOgImageContentType,
  marketingOgImageSize,
  toMarketingOgHeading,
} from "@/lib/og/create-marketing-og-image";

export const alt = "Hyperlocalise Blog";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

type BlogPostOgImageProps = {
  params: Promise<{ lang: string; slug: string }>;
};

export default async function Image({ params }: BlogPostOgImageProps) {
  const { lang, slug } = await params;
  const intl = getIntlShape(lang);
  const post = getPostBySlug(slug, lang);

  if (!post) {
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
    heading: toMarketingOgHeading(post.title),
    description: post.excerpt,
  });
}
