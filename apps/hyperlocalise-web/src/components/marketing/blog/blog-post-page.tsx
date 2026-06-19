"use client";

import type { Post } from "@/lib/blog/blog-post";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { BlogPostCard } from "@/components/marketing/blog/blog-post-card";
import { BlogPostCover } from "@/components/marketing/blog/blog-post-cover";
import { blogMessages } from "@/components/marketing/blog/blog.messages";
import { formatBlogPostDate } from "@/components/marketing/blog/format-blog-post-date";
import {
  TypographyH1,
  TypographyH2,
  TypographyMuted,
  TypographyP,
} from "@/components/ui/typography";
import { useIntl } from "react-intl";

import markdownStyles from "@/app/[lang]/(marketing)/blog/[slug]/markdown.module.css";

type BlogPostPageProps = {
  post: Post;
  lang: string;
  htmlContent: string;
  relatedPosts: Post[];
};

export function BlogPostPage({ post, lang, htmlContent, relatedPosts }: BlogPostPageProps) {
  const intl = useIntl();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-7xl">
        <article className="px-5 pb-20 pt-12 sm:px-8 lg:px-10 lg:pt-16">
          <header className="mx-auto max-w-3xl text-center">
            <TypographyH1 className="text-3xl tracking-tight sm:text-4xl lg:text-5xl">
              {post.title}
            </TypographyH1>
            <TypographyP className="mt-4 text-base text-muted-foreground sm:text-lg">
              {post.excerpt}
            </TypographyP>
            <TypographyMuted className="mt-4 text-sm">
              {formatBlogPostDate(intl, post.date)}
            </TypographyMuted>
          </header>

          <div className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-xl">
            <BlogPostCover
              alt={post.title}
              className="aspect-[16/10] w-full object-cover"
              lang={lang}
              post={post}
              priority
            />
          </div>

          <div
            className={`${markdownStyles.markdown} mx-auto mt-12 max-w-3xl`}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </article>

        {relatedPosts.length > 0 ? (
          <section className="border-t border-border/70 px-5 py-16 sm:px-8 lg:px-10">
            <div className="mx-auto max-w-3xl">
              <TypographyH2 className="text-2xl tracking-tight">
                {intl.formatMessage(blogMessages.relatedPostsTitle)}
              </TypographyH2>
              <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
                {relatedPosts.map((relatedPost) => (
                  <BlogPostCard key={relatedPost.slug} lang={lang} post={relatedPost} />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="border-t border-border/70 px-5 py-16 sm:px-8 lg:px-10">
          <MarketingFooter columns={footerColumns} />
        </section>
      </main>
    </div>
  );
}
