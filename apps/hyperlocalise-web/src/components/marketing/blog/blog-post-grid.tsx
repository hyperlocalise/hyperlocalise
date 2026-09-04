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
import type { PostSummary } from "@/lib/blog/blog-post";
import { BlogPostCard } from "@/components/marketing/blog/blog-post-card";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Rows } from "@/components/ui/layout/rows";

type BlogPostGridProps = {
  posts: PostSummary[];
  lang: string;
  columns?: 2 | 4;
};

const columnWidthByCount = {
  2: "1/2",
  4: "1/4",
} as const;

const collapseBelowByCount = {
  2: "medium",
  4: "large",
} as const;

function groupPostsIntoRows(posts: PostSummary[], columns: 2 | 4): PostSummary[][] {
  const rows: PostSummary[][] = [];

  for (let index = 0; index < posts.length; index += columns) {
    rows.push(posts.slice(index, index + columns));
  }

  return rows;
}

export function BlogPostGrid({ posts, lang, columns = 2 }: BlogPostGridProps) {
  const rows = groupPostsIntoRows(posts, columns);

  return (
    <Rows spacing="4u">
      {rows.map((rowPosts, rowIndex) => (
        <Columns key={rowIndex} spacing="4u" collapseBelow={collapseBelowByCount[columns]}>
          {rowPosts.map((post) => (
            <Column key={post.slug} width={columnWidthByCount[columns]}>
              <BlogPostCard lang={lang} post={post} />
            </Column>
          ))}
        </Columns>
      ))}
    </Rows>
  );
}
