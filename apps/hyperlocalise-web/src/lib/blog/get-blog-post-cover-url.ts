import type { Post } from "@/lib/blog/blog-post";

export function getBlogPostCoverUrl(post: Post, lang: string) {
  if (post.coverImage) {
    return post.coverImage;
  }

  return `/${lang}/blog/${post.slug}/opengraph-image`;
}

export function getBlogPostCoverAbsoluteUrl(post: Post, lang: string, baseUrl: string) {
  const coverUrl = getBlogPostCoverUrl(post, lang);
  return new URL(coverUrl, baseUrl).toString();
}
