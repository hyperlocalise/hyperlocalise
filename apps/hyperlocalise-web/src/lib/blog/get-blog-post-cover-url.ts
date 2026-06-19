import type { Post } from "@/lib/blog/blog-post";
import { getBlogPostOpenGraphImagePath } from "@/lib/blog/blog-post-path";

export function getBlogPostCoverUrl(post: Post, lang: string) {
  if (post.coverImage) {
    return post.coverImage;
  }

  return getBlogPostOpenGraphImagePath(lang, post.slug) ?? `/${lang}/blog`;
}

export function getBlogPostCoverAbsoluteUrl(post: Post, lang: string, baseUrl: string) {
  const coverUrl = getBlogPostCoverUrl(post, lang);
  return new URL(coverUrl, baseUrl).toString();
}
