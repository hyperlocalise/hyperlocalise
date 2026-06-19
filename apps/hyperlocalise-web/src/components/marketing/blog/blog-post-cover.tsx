import type { Post } from "@/lib/blog/blog-post";
import { getBlogPostCoverUrl } from "@/lib/blog/get-blog-post-cover-url";
import Image from "next/image";

type BlogPostCoverProps = {
  post: Post;
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
