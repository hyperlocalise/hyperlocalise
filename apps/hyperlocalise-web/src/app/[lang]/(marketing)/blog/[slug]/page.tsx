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
import type { Article, WithContext } from "schema-dts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BlogPostPage } from "@/components/marketing/blog/blog-post-page";
import { JsonLd } from "@/components/seo/json-ld";
import { ORGANIZATION_JSON_LD_ID } from "@/components/seo/organization-json-ld";
import { brandLogomarkAbsoluteUrl } from "@/lib/brand/brand-assets";
import { jsonLdInLanguage } from "@/lib/seo/json-ld-in-language";
import {
  DEFAULT_APP_LOCALE,
  normalizeAppLocale,
  SUPPORTED_APP_LOCALES,
  type AppLocale,
} from "@/lib/app-i18n/locales";
import { getBlogAuthor } from "@/lib/blog/blog-authors";
import { getPostBySlug, getPostSlugs, getRelevantPosts } from "@/lib/blog/blog-post";
import { getBlogPostMarkdownUrl } from "@/lib/blog/blog-post-markdown";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { buildBreadcrumbJsonLd, stripBrandTitleSuffix } from "@/lib/seo/breadcrumb-json-ld";
import { getBlogRouteMetadata } from "../blog-route-metadata";
import { getBlogPostPath } from "@/lib/blog/blog-post-path";
import { getBlogPostCoverAbsoluteUrl } from "@/lib/blog/get-blog-post-cover-url";
import { markdownToHtml } from "@/lib/blog/markdown-to-html";
import { getLocalizedAlternates, localizedOpenGraph } from "@/lib/seo/localized-alternates";
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
  const author = getBlogAuthor(post.author);

  return {
    title: `${post.title} | Hyperlocalise`,
    description: post.excerpt,
    alternates: {
      ...getLocalizedAlternates({
        locale,
        path: `/blog/${post.slug}`,
        locales: availableLocales,
      }),
      types: { "text/markdown": getBlogPostMarkdownUrl(locale, post.slug) },
    },
    ...(author ? { authors: [{ name: author.name, url: author.profileUrl }] } : {}),
    openGraph: localizedOpenGraph(locale, `/blog/${post.slug}`, {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
      ...(post.updated ? { modifiedTime: post.updated } : {}),
      images: [imageUrl],
    }),
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
  const author = getBlogAuthor(post.author);

  const articleSchema: WithContext<Article> = {
    "@context": "https://schema.org",
    "@type": "Article",
    inLanguage: jsonLdInLanguage(locale),
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
    dateModified: post.updated ?? post.date,
    author: author
      ? {
          "@type": "Person",
          name: author.name,
          jobTitle: author.jobTitle,
          url: author.profileUrl,
          sameAs: [author.profileUrl],
          worksFor: { "@id": ORGANIZATION_JSON_LD_ID },
        }
      : {
          "@type": "Organization",
          "@id": ORGANIZATION_JSON_LD_ID,
          name: "Hyperlocalise",
          url: SITE_URL,
        },
    publisher: {
      "@type": "Organization",
      "@id": ORGANIZATION_JSON_LD_ID,
      name: "Hyperlocalise",
      logo: {
        "@type": "ImageObject",
        url: brandLogomarkAbsoluteUrl,
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

  const htmlContent = await markdownToHtml(post.content, { locale });
  const jsonLd = buildArticleJsonLd(post, locale);
  const blogTitle = stripBrandTitleSuffix(getBlogRouteMetadata(getIntlShape(locale)).title);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(locale, [
    { name: blogTitle, path: "/blog" },
    { name: post.title, path: `/blog/${post.slug}` },
  ]);
  const relatedPosts = getRelevantPosts(slug, locale);

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <BlogPostPage
        htmlContent={htmlContent}
        lang={locale}
        post={post}
        relatedPosts={relatedPosts}
      />
    </>
  );
}
