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
import { getBlogAuthor } from "@/lib/blog/blog-authors";
import type { Post } from "@/lib/blog/blog-post";
import { getBlogPostPath } from "@/lib/blog/blog-post-path";
import { SITE_URL } from "@/lib/seo/site-url";

/**
 * Plain Markdown copies of blog posts for answer engines and agents.
 * Served at `/{lang}/blog/{slug}.md` through a rewrite to `/blog-markdown/{lang}/{slug}`.
 */
export function getBlogPostMarkdownUrl(lang: string, slug: string): string {
  const path = getBlogPostPath(lang, slug);
  return path ? `${SITE_URL}${path}.md` : `${SITE_URL}/${lang}/blog`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

export function buildBlogPostMarkdown(post: Post, lang: string): string {
  const path = getBlogPostPath(lang, post.slug);
  const canonicalUrl = path ? `${SITE_URL}${path}` : `${SITE_URL}/${lang}/blog`;
  const frontmatter = [
    "---",
    `title: ${yamlString(post.title)}`,
    `description: ${yamlString(post.excerpt)}`,
    `url: ${canonicalUrl}`,
    `language: ${lang}`,
    `published: ${post.date.slice(0, 10)}`,
    ...(post.updated ? [`updated: ${post.updated.slice(0, 10)}`] : []),
    `author: ${yamlString(getBlogAuthor(post.author)?.name ?? "Hyperlocalise")}`,
    "---",
  ].join("\n");

  return `${frontmatter}\n\n# ${post.title}\n\n${post.content.trim()}\n`;
}
