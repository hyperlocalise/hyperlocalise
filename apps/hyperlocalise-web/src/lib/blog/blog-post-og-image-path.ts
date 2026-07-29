/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
