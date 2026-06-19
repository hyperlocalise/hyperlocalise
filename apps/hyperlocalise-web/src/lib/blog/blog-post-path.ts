import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";

const BLOG_POST_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const MAX_BLOG_POST_SLUG_LENGTH = 120;

export function isValidBlogPostSlug(slug: string): boolean {
  return (
    slug.length > 0 && slug.length <= MAX_BLOG_POST_SLUG_LENGTH && BLOG_POST_SLUG_PATTERN.test(slug)
  );
}

export function normalizeBlogPostSlug(slug: string): string | null {
  const trimmed = slug.replace(/\.md$/, "");
  return isValidBlogPostSlug(trimmed) ? trimmed : null;
}

export function getBlogPostPath(lang: string, slug: string): string | null {
  const safeLang = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const safeSlug = normalizeBlogPostSlug(slug);

  if (!safeSlug) {
    return null;
  }

  return `/${safeLang}/blog/${encodeURIComponent(safeSlug)}`;
}

export function getBlogPostOpenGraphImagePath(lang: string, slug: string): string | null {
  const postPath = getBlogPostPath(lang, slug);

  if (!postPath) {
    return null;
  }

  return `${postPath}/opengraph-image`;
}
