import type { Article, WithContext } from "schema-dts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BlogPostPage } from "@/components/marketing/blog/blog-post-page";
import { JsonLd } from "@/components/seo/json-ld";
import { SUPPORTED_APP_LOCALES } from "@/lib/app-i18n/locales";
import { getPostBySlug, getPostSlugs } from "@/lib/blog/blog-post";
import { getBlogPostPath } from "@/lib/blog/blog-post-path";
import { getBlogPostCoverAbsoluteUrl } from "@/lib/blog/get-blog-post-cover-url";
import { markdownToHtml } from "@/lib/blog/markdown-to-html";

const BASE_URL = "https://www.hyperlocalise.com";

type BlogPostRouteParams = {
  lang: string;
  slug: string;
};

type BlogPostRouteProps = {
  params: Promise<BlogPostRouteParams>;
};

export function generateStaticParams() {
  return SUPPORTED_APP_LOCALES.flatMap((lang) =>
    getPostSlugs(lang).map((slug) => ({ lang, slug })),
  );
}

export async function generateMetadata({ params }: BlogPostRouteProps): Promise<Metadata> {
  const { lang, slug } = await params;
  const post = getPostBySlug(slug, lang);

  if (!post) {
    return {};
  }

  return {
    title: `${post.title} | Hyperlocalise`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
    },
  };
}

function buildArticleJsonLd(post: NonNullable<ReturnType<typeof getPostBySlug>>, lang: string) {
  const postPath = getBlogPostPath(lang, post.slug);
  const canonicalUrl = postPath ? `${BASE_URL}${postPath}` : `${BASE_URL}/${lang}/blog`;
  const imageUrl = getBlogPostCoverAbsoluteUrl(post, lang, BASE_URL);

  const articleSchema: WithContext<Article> = {
    "@context": "https://schema.org",
    "@type": "Article",
    url: canonicalUrl,
    thumbnailUrl: imageUrl,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    headline: post.title,
    description: post.excerpt,
    image: imageUrl,
    datePublished: post.date,
    author: {
      "@type": "Organization",
      name: "Hyperlocalise",
      url: BASE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Hyperlocalise",
      logo: {
        "@type": "ImageObject",
        url: `${BASE_URL}/images/logo.png`,
      },
    },
  };

  return articleSchema;
}

export default async function BlogPostRoute({ params }: BlogPostRouteProps) {
  const { lang, slug } = await params;
  const post = getPostBySlug(slug, lang);

  if (!post) {
    notFound();
  }

  const htmlContent = await markdownToHtml(post.content);
  const jsonLd = buildArticleJsonLd(post, lang);

  return (
    <>
      <JsonLd data={jsonLd} />
      <BlogPostPage htmlContent={htmlContent} lang={lang} post={post} />
    </>
  );
}
