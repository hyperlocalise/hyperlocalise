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
import type { Article, WithContext } from "schema-dts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BlogPostPage } from "@/components/marketing/blog/blog-post-page";
import { JsonLd } from "@/components/seo/json-ld";
import {
  DEFAULT_APP_LOCALE,
  normalizeAppLocale,
  SUPPORTED_APP_LOCALES,
  type AppLocale,
} from "@/lib/app-i18n/locales";
import { getPostBySlug, getPostSlugs, getRelevantPosts } from "@/lib/blog/blog-post";
import { getBlogPostPath } from "@/lib/blog/blog-post-path";
import { getBlogPostCoverAbsoluteUrl } from "@/lib/blog/get-blog-post-cover-url";
import { markdownToHtml } from "@/lib/blog/markdown-to-html";
import { getLocalizedAlternates } from "@/lib/seo/localized-alternates";
import { SITE_URL } from "@/lib/seo/site-url";

function getLocalesWithBlogPost(slug: string): AppLocale[] {
  return SUPPORTED_APP_LOCALES.filter((locale) => getPostBySlug(slug, locale) != null);
}

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
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const post = getPostBySlug(slug, locale);

  if (!post) {
    return {};
  }

  const imageUrl = getBlogPostCoverAbsoluteUrl(post, locale, SITE_URL);
  const availableLocales = getLocalesWithBlogPost(slug);

  return {
    title: `${post.title} | Hyperlocalise`,
    description: post.excerpt,
    alternates: getLocalizedAlternates({
      locale,
      path: `/blog/${post.slug}`,
      locales: availableLocales,
    }),
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
      images: [imageUrl],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      images: [imageUrl],
    },
  };
}

function buildArticleJsonLd(
  post: NonNullable<ReturnType<typeof getPostBySlug>>,
  locale: AppLocale,
) {
  const postPath = getBlogPostPath(locale, post.slug);
  const canonicalUrl = postPath ? `${SITE_URL}${postPath}` : `${SITE_URL}/${locale}/blog`;
  const imageUrl = getBlogPostCoverAbsoluteUrl(post, locale, SITE_URL);

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
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Hyperlocalise",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/images/logo.png`,
      },
    },
  };

  return articleSchema;
}

export default async function BlogPostRoute({ params }: BlogPostRouteProps) {
  const { lang, slug } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const post = getPostBySlug(slug, locale);

  if (!post) {
    notFound();
  }

  const htmlContent = await markdownToHtml(post.content);
  const jsonLd = buildArticleJsonLd(post, locale);
  const relatedPosts = getRelevantPosts(slug, locale);

  return (
    <>
      <JsonLd data={jsonLd} />
      <BlogPostPage
        htmlContent={htmlContent}
        lang={locale}
        post={post}
        relatedPosts={relatedPosts}
      />
    </>
  );
}
