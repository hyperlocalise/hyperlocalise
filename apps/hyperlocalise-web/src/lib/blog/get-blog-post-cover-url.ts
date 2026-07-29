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
import type { PostSummary } from "@/lib/blog/blog-post";
import { getBlogPostOgImagePath } from "@/lib/blog/blog-post-og-image-path";

export function getBlogPostCoverUrl(post: PostSummary, lang: string) {
  if (post.coverImage) {
    return post.coverImage;
  }

  return getBlogPostOgImagePath(lang, post.slug) ?? `/${lang}/blog`;
}

export function getBlogPostCoverAbsoluteUrl(post: PostSummary, lang: string, baseUrl: string) {
  const coverUrl = getBlogPostCoverUrl(post, lang);
  return new URL(coverUrl, baseUrl).toString();
}
