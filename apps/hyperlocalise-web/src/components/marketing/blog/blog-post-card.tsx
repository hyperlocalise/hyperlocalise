"use client";

import type { Post } from "@/lib/blog/blog-post";
import { formatBlogPostDate } from "@/components/marketing/blog/format-blog-post-date";
import { BlogPostCover } from "@/components/marketing/blog/blog-post-cover";
import Link from "next/link";
import { useIntl } from "react-intl";

type BlogPostCardProps = {
  post: Post;
  lang: string;
};

export function BlogPostCard({ post, lang }: BlogPostCardProps) {
  const intl = useIntl();

  return (
    <Link className="group block space-y-4" href={`/${lang}/blog/${post.slug}`}>
      <div className="overflow-hidden rounded-xl">
        <BlogPostCover
          alt={post.title}
          className="aspect-[16/10] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          lang={lang}
          post={post}
        />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-tight text-foreground transition-colors group-hover:text-foreground/90">
          {post.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {post.category} · {formatBlogPostDate(intl, post.date)}
        </p>
      </div>
    </Link>
  );
}
