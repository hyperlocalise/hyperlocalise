import fs from "node:fs";
import { join } from "node:path";

import matter from "gray-matter";

import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { isValidBlogPostSlug, normalizeBlogPostSlug } from "@/lib/blog/blog-post-path";

export interface Post {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  category: string;
  coverImage?: string;
  content: string;
  preview?: boolean;
  tags?: string[];
}

const DEFAULT_CATEGORY = "Blog";

function frontmatterString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
}

function postsDirectory(locale: string) {
  const safeLocale = normalizeAppLocale(locale) ?? DEFAULT_APP_LOCALE;
  return join(process.cwd(), "_posts", safeLocale);
}

function normalizePost(slug: string, data: Record<string, unknown>, content: string): Post {
  return {
    slug,
    title: frontmatterString(data.title),
    date: frontmatterString(data.date),
    excerpt: frontmatterString(data.excerpt),
    category: frontmatterString(data.category, DEFAULT_CATEGORY),
    coverImage: typeof data.coverImage === "string" ? data.coverImage : undefined,
    preview: Boolean(data.preview),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : undefined,
    content,
  };
}

function getPostSlugsFromDirectory(locale: string) {
  const directory = postsDirectory(locale);

  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory).filter((file) => {
    if (!file.endsWith(".md")) {
      return false;
    }

    const slug = file.replace(/\.md$/, "");
    return isValidBlogPostSlug(slug);
  });
}

export function parseBlogPostDate(date: string): Date | null {
  const timestamp = Date.parse(date);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp);
}

export function getPostSlugs(locale: string) {
  return getPostSlugsFromDirectory(locale).map((file) => file.replace(/\.md$/, ""));
}

export function getPostBySlug(slug: string, locale: string): Post | null {
  const realSlug = normalizeBlogPostSlug(slug);
  if (!realSlug) {
    return null;
  }

  try {
    const fullPath = join(postsDirectory(locale), `${realSlug}.md`);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(fileContents);

    return normalizePost(realSlug, data, content);
  } catch {
    return null;
  }
}

export function getAllPosts(locale: string, { includePreview = false } = {}): Post[] {
  const slugs = getPostSlugsFromDirectory(locale);

  return slugs
    .map((file) => getPostBySlug(file, locale))
    .filter((post): post is Post => post != null)
    .filter((post) => includePreview || !post.preview)
    .sort((post1, post2) => (post1.date > post2.date ? -1 : 1));
}

function calculateRelevanceScore(currentPost: Post, candidatePost: Post): number {
  let score = 0;

  if (currentPost.tags && candidatePost.tags && currentPost.tags.length > 0) {
    const currentTags = currentPost.tags.map((tag) => tag.toLowerCase());
    const candidateTags = candidatePost.tags.map((tag) => tag.toLowerCase());
    const matchingTags = currentTags.filter((tag) => candidateTags.includes(tag));
    score += matchingTags.length * 10;
  }

  const currentKeywords = [
    ...currentPost.title.toLowerCase().split(/\s+/),
    ...currentPost.excerpt.toLowerCase().split(/\s+/),
  ].filter((word) => word.length > 4);

  const candidateText = `${candidatePost.title} ${candidatePost.excerpt}`.toLowerCase();
  const matchingKeywords = currentKeywords.filter((word) => candidateText.includes(word));
  score += matchingKeywords.length * 2;

  const currentDate = new Date(currentPost.date).getTime();
  const candidateDate = new Date(candidatePost.date).getTime();
  const daysDifference = Math.abs(currentDate - candidateDate) / (1000 * 60 * 60 * 24);
  const recencyBonus = Math.max(0, 5 - (daysDifference / 30) * 5);
  score += recencyBonus;

  return score;
}

export function getRelevantPosts(currentSlug: string, locale: string, limit = 3): Post[] {
  const currentPost = getPostBySlug(currentSlug, locale);
  if (!currentPost) {
    return [];
  }

  const otherPosts = getAllPosts(locale).filter((post) => post.slug !== currentSlug);
  const postsWithScores = otherPosts.map((post) => ({
    post,
    score: calculateRelevanceScore(currentPost, post),
  }));

  postsWithScores.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.post.date > a.post.date ? 1 : -1;
  });

  return postsWithScores.slice(0, limit).map((item) => item.post);
}
