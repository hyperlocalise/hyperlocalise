import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { normalizeBlogPostSlug } from "@/lib/blog/blog-post-path";

export const blogPostCoverSize = { width: 1200, height: 750 } as const;

export function getBlogPostOgImagePath(lang: string, slug: string): string | null {
  const safeSlug = normalizeBlogPostSlug(slug);

  if (!safeSlug) {
    return null;
  }

  const safeLang = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const searchParams = new URLSearchParams({ lang: safeLang });

  return `/api/blog/${encodeURIComponent(safeSlug)}/og-image?${searchParams.toString()}`;
}
