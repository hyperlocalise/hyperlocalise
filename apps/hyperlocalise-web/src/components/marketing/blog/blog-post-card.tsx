"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { PostSummary } from "@/lib/blog/blog-post";
import { getBlogPostPath } from "@/lib/blog/blog-post-path";
import { formatBlogPostDate } from "@/components/marketing/blog/format-blog-post-date";
import { BlogPostCover } from "@/components/marketing/blog/blog-post-cover";
import Link from "next/link";
import { useIntl } from "react-intl";

type BlogPostCardProps = {
  post: PostSummary;
  lang: string;
};

export function BlogPostCard({ post, lang }: BlogPostCardProps) {
  const intl = useIntl();
  const href = getBlogPostPath(lang, post.slug);
  const metaLine = [post.category, formatBlogPostDate(intl, post.date)].join(" · ");

  if (!href) {
    return null;
  }

  return (
    <Link className="group block space-y-4" href={href}>
      <div className="overflow-hidden rounded-xl">
        <BlogPostCover
          alt={post.title}
          className="aspect-[16/10] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          lang={lang}
          post={post}
        />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-tight text-foreground transition-colors group-hover:text-foreground">
          {post.title}
        </h2>
        <p className="text-sm text-muted-foreground">{metaLine}</p>
      </div>
    </Link>
  );
}
