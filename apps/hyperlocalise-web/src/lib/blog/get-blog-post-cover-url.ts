import type { PostSummary } from "@/lib/blog/blog-post";
import { getBlogPostOgImagePath } from "@/lib/blog/blog-post-og-image-path";

export function getBlogPostCoverUrl(post: PostSummary, lang: string) {
  if (post.coverImage) {
    return post.coverImage;
  }

  return getBlogPostOgImagePath(lang, post.slug) ?? `/${lang}/blog`;
}

export function getBlogPostCoverAbsoluteUrl(post: PostSummary, lang: string, baseUrl: string) {
  const coverUrl = getBlogPostCoverUrl(post, lang);
  return new URL(coverUrl, baseUrl).toString();
}
