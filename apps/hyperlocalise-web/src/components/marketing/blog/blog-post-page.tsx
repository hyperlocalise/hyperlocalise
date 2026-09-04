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
import type { Post } from "@/lib/blog/blog-post";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { BlogPostGrid } from "@/components/marketing/blog/blog-post-grid";
import { BlogPostCover } from "@/components/marketing/blog/blog-post-cover";
import { blogMessages } from "@/components/marketing/blog/blog.messages";
import { formatBlogPostDate } from "@/components/marketing/blog/format-blog-post-date";
import { Box } from "@/components/ui/layout/box";
import { Rows } from "@/components/ui/layout/rows";
import { Separator } from "@/components/ui/separator";
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
    <Box background="canvas" width="full">
      <main className="mx-auto min-h-screen max-w-7xl text-foreground">
        <Rows spacing="0">
          <Box paddingX="3u" paddingTop="6u" paddingBottom="8u">
            <article className="mx-auto max-w-3xl">
              <Rows spacing="4u" align="center">
                <Rows spacing="2u" align="center">
                  <TypographyH1 className="text-center text-3xl sm:text-4xl lg:text-5xl">
                    {post.title}
                  </TypographyH1>
                  <TypographyP className="text-center sm:text-lg" tone="subtle">
                    {post.excerpt}
                  </TypographyP>
                  <TypographyMuted className="text-center">
                    {formatBlogPostDate(intl, post.date)}
                  </TypographyMuted>
                </Rows>

                <Box borderRadius="large" width="full">
                  <div className="overflow-hidden rounded-2xl">
                    <BlogPostCover
                      alt={post.title}
                      className="aspect-[16/10] w-full object-cover"
                      lang={lang}
                      post={post}
                      priority
                    />
                  </div>
                </Box>

                <div
                  className={markdownStyles.markdown}
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                />
              </Rows>
            </article>
          </Box>

          {relatedPosts.length > 0 ? (
            <>
              <Separator />
              <Box paddingX="3u" paddingY="6u">
                <div className="mx-auto max-w-3xl">
                  <Rows spacing="4u">
                    <TypographyH2 className="text-2xl tracking-tight">
                      {intl.formatMessage(blogMessages.relatedPostsTitle)}
                    </TypographyH2>
                    <BlogPostGrid lang={lang} posts={relatedPosts} />
                  </Rows>
                </div>
              </Box>
            </>
          ) : null}

          <Separator />
          <Box paddingX="3u" paddingY="8u">
            <FinalCtaSection />
          </Box>

          <Separator />
          <Box paddingX="3u" paddingTop="6u">
            <MarketingFooter columns={footerColumns} />
          </Box>
        </Rows>
      </main>
    </Box>
  );
}
