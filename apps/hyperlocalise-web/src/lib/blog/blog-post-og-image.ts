import { getIntlShape } from "@/lib/app-i18n/intl";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { getPostBySlug } from "@/lib/blog/blog-post";
import { blogPostCoverSize } from "@/lib/blog/blog-post-og-image-path";
import { normalizeBlogPostSlug } from "@/lib/blog/blog-post-path";
import {
  createMarketingOgImage,
  marketingOgImageContentType,
  toMarketingOgHeading,
} from "@/lib/og/create-marketing-og-image";

export async function createBlogPostOgImageResponse(lang: string, slug: string) {
  const safeSlug = normalizeBlogPostSlug(slug);

  if (!safeSlug) {
    return null;
  }

  const safeLang = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const post = getPostBySlug(safeSlug, safeLang);

  if (!post || post.preview) {
    return null;
  }

  const intl = getIntlShape(safeLang);
  const imageResponse = await createMarketingOgImage({
    heading: toMarketingOgHeading(post.title),
    description:
      post.excerpt ||
      intl.formatMessage({
        defaultMessage: "Localisation for the Agentic Era.",
        id: "jycg40Y0pj",
        description: "Open Graph fallback description for unknown pages",
      }),
    size: blogPostCoverSize,
  });

  imageResponse.headers.set("Content-Type", marketingOgImageContentType);
  imageResponse.headers.set(
    "Cache-Control",
    "public, max-age=86400, stale-while-revalidate=604800",
  );

  return imageResponse;
}
