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
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { BlogPostGrid } from "@/components/marketing/blog/blog-post-grid";
import { blogMessages } from "@/components/marketing/blog/blog.messages";
import { Box } from "@/components/ui/layout/box";
import { Rows } from "@/components/ui/layout/rows";
import { Separator } from "@/components/ui/separator";
import { TypographyH1, TypographyMuted } from "@/components/ui/typography";
import { useIntl } from "react-intl";

type BlogIndexPageProps = {
  posts: Post[];
  lang: string;
};

export function BlogIndexPage({ posts, lang }: BlogIndexPageProps) {
  const intl = useIntl();

  return (
    <Box background="canvas" width="full">
      <main className="mx-auto min-h-screen max-w-7xl text-foreground">
        <Rows spacing="0">
          <Box paddingX="3u" paddingTop="6u" paddingBottom="4u">
            <Rows spacing="2u" align="center">
              <TypographyH1 className="text-center text-4xl sm:text-5xl">
                {intl.formatMessage(blogMessages.indexTitle)}
              </TypographyH1>
              <TypographyMuted className="max-w-2xl text-center sm:text-lg" size="medium">
                {intl.formatMessage(blogMessages.indexTagline)}
              </TypographyMuted>
            </Rows>
          </Box>

          <Box paddingX="3u" paddingBottom="8u">
            {posts.length > 0 ? (
              <BlogPostGrid lang={lang} posts={posts} />
            ) : (
              <TypographyMuted className="text-center" size="medium">
                {intl.formatMessage(blogMessages.indexEmptyState)}
              </TypographyMuted>
            )}
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
