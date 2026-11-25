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
import { normalizeAppLocale } from "@/lib/app-i18n/locales";
import { getPostBySlug } from "@/lib/blog/blog-post";
import { buildBlogPostMarkdown } from "@/lib/blog/blog-post-markdown";
import { getBlogPostPath } from "@/lib/blog/blog-post-path";
import { SITE_URL } from "@/lib/seo/site-url";

type BlogMarkdownRouteContext = {
  params: Promise<{ lang: string; slug: string }>;
};

/** Reached through the `/{lang}/blog/{slug}.md` rewrite in next.config.ts. */
export async function GET(_request: Request, { params }: BlogMarkdownRouteContext) {
  const { lang, slug } = await params;
  const locale = normalizeAppLocale(lang);
  const post = locale ? getPostBySlug(slug, locale) : null;

  if (!locale || !post || post.preview) {
    return new Response("Not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(buildBlogPostMarkdown(post, locale), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      // The HTML post is the canonical page, so search engines fold this copy into it.
      Link: `<${SITE_URL}${getBlogPostPath(locale, post.slug)}>; rel="canonical"`,
    },
  });
}
