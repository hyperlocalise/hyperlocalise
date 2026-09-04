"use client";

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
import Link from "next/link";
import { FormattedMessage, useIntl } from "react-intl";

import type { PostSummary } from "@/lib/blog/blog-post";
import { BlogPostGrid } from "@/components/marketing/blog/blog-post-grid";
import { blogMessages } from "@/components/marketing/blog/blog.messages";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyH2, TypographyP } from "@/components/ui/typography";

import { recentBlogPostsSectionMessages } from "./recent-blog-posts-section.messages";

type RecentBlogPostsSectionProps = {
  posts: PostSummary[];
  lang: string;
};

export function RecentBlogPostsSection({ posts, lang }: RecentBlogPostsSectionProps) {
  const intl = useIntl();
  const blogIndexHref = `/${lang}/blog`;

  return (
    <section id="blog">
      <Rows spacing="6u">
        <Columns spacing="3u" alignY="end" collapseBelow="small">
          <Column width="fluid">
            <Rows spacing="1u">
              <TypographyP
                className="text-[0.68rem] tracking-[0.22em]"
                weight="bold"
                capitalization="uppercase"
                tone="subtle"
              >
                <FormattedMessage {...recentBlogPostsSectionMessages.eyebrow} />
              </TypographyP>
              <TypographyH2
                className="pt-3 pb-0 text-4xl tracking-[-0.04em] normal-case sm:text-5xl md:text-5xl"
                weight="bold"
                tone="content"
              >
                <FormattedMessage {...recentBlogPostsSectionMessages.heading} />
              </TypographyH2>
              <TypographyP
                className="max-w-xl leading-6 sm:text-[0.95rem]"
                wrapStyle="pretty"
                size="small"
                tone="subtle"
              >
                <FormattedMessage {...recentBlogPostsSectionMessages.description} />
              </TypographyP>
            </Rows>
          </Column>

          {posts.length > 0 ? (
            <Column width="content">
              <Link
                className="inline-flex min-h-11 shrink-0 items-center rounded-full text-sm font-medium text-[color-mix(in_oklch,var(--foreground)_88%,var(--chart-4)_12%)] transition-colors duration-200 ease-out hover:text-[color-mix(in_oklch,var(--foreground)_68%,var(--chart-4)_32%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--ring)_55%,var(--chart-2)_45%)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                href={blogIndexHref}
              >
                <FormattedMessage {...recentBlogPostsSectionMessages.viewAllPosts} />
              </Link>
            </Column>
          ) : null}
        </Columns>

        {posts.length > 0 ? (
          <BlogPostGrid columns={4} lang={lang} posts={posts} />
        ) : (
          <TypographyP className="text-center" size="small" tone="subtle">
            {intl.formatMessage(blogMessages.indexEmptyState)}
          </TypographyP>
        )}
      </Rows>
    </section>
  );
}
