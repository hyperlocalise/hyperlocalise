"use client";

import Link from "next/link";
import { FormattedMessage, useIntl } from "react-intl";

import type { PostSummary } from "@/lib/blog/blog-post";
import { BlogPostCard } from "@/components/marketing/blog/blog-post-card";
import { blogMessages } from "@/components/marketing/blog/blog.messages";
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
    <section id="blog" className="relative">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <TypographyP className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <FormattedMessage {...recentBlogPostsSectionMessages.eyebrow} />
          </TypographyP>
          <TypographyH2 className="pt-3 pb-0 text-4xl font-semibold tracking-[-0.04em] normal-case text-foreground sm:text-5xl md:text-5xl">
            <FormattedMessage {...recentBlogPostsSectionMessages.heading} />
          </TypographyH2>
          <TypographyP className="mt-4 max-w-xl text-pretty text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
            <FormattedMessage {...recentBlogPostsSectionMessages.description} />
          </TypographyP>
        </div>

        {posts.length > 0 ? (
          <Link
            className="inline-flex min-h-11 shrink-0 items-center rounded-full text-sm font-medium text-[color-mix(in_oklch,var(--foreground)_88%,var(--chart-4)_12%)] transition-colors duration-200 ease-out hover:text-[color-mix(in_oklch,var(--foreground)_68%,var(--chart-4)_32%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--ring)_55%,var(--chart-2)_45%)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href={blogIndexHref}
          >
            <FormattedMessage {...recentBlogPostsSectionMessages.viewAllPosts} />
          </Link>
        ) : null}
      </div>

      <div className="mt-10">
        {posts.length > 0 ? (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
            {posts.map((post) => (
              <BlogPostCard key={post.slug} lang={lang} post={post} />
            ))}
          </div>
        ) : (
          <TypographyP className="text-center text-sm text-muted-foreground">
            {intl.formatMessage(blogMessages.indexEmptyState)}
          </TypographyP>
        )}
      </div>
    </section>
  );
}
