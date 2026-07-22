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
import { getBlogPostCoverUrl } from "@/lib/blog/get-blog-post-cover-url";
import Image from "next/image";

type BlogPostCoverProps = {
  post: PostSummary;
  lang: string;
  alt: string;
  className?: string;
  priority?: boolean;
};

export function BlogPostCover({ post, lang, alt, className, priority }: BlogPostCoverProps) {
  const src = getBlogPostCoverUrl(post, lang);
  const isDynamicCover = !post.coverImage || /^https?:\/\//.test(post.coverImage);

  return (
    <Image
      alt={alt}
      className={className}
      height={630}
      priority={priority}
      src={src}
      unoptimized={isDynamicCover}
      width={1200}
    />
  );
}
