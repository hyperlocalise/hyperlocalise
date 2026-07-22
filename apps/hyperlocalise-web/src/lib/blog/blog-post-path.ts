/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
