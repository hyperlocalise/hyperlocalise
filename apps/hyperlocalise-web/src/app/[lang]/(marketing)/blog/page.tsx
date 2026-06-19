import type { Metadata } from "next";

import { BlogIndexPage } from "@/components/marketing/blog/blog-index-page";
import { getAllPosts } from "@/lib/blog/blog-post";
import { getIntlShape } from "@/lib/app-i18n/intl";

import { getBlogRouteMetadata } from "./blog-route-metadata";

type BlogIndexRouteProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: BlogIndexRouteProps): Promise<Metadata> {
  const { lang } = await params;
  const intl = getIntlShape(lang);
  const metadata = getBlogRouteMetadata(intl);

  return {
    title: metadata.title,
    description: metadata.description,
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      type: "website",
    },
  };
}

export default async function BlogIndexRoute({ params }: BlogIndexRouteProps) {
  const { lang } = await params;
  const posts = getAllPosts(lang);

  return <BlogIndexPage lang={lang} posts={posts} />;
}
