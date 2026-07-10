import fs from "node:fs";
import { basename } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { directoryEntries, fileContents } = vi.hoisted(() => ({
  directoryEntries: [] as string[],
  fileContents: {} as Record<string, string>,
}));

vi.mock("node:fs", () => {
  const fsMock = {
    existsSync: vi.fn((path: string) => directoryEntries.length > 0 || path.includes("_posts")),
    readdirSync: vi.fn(() => [...directoryEntries]),
    readFileSync: vi.fn((fullPath: string) => {
      const slug = basename(fullPath).replace(/\.md$/, "");
      const content = fileContents[slug];
      if (!content) {
        const error = new Error(`ENOENT: no such file or directory, open '${fullPath}'`);
        (error as NodeJS.ErrnoException).code = "ENOENT";
        throw error;
      }
      return content;
    }),
  };

  return {
    default: fsMock,
    ...fsMock,
  };
});

import type { Post } from "./blog-post";
import * as blogPost from "./blog-post";

const { parseBlogPostDate } = blogPost;

const DEFAULT_LOCALE = "en";

const serializePost = (post: Post) => {
  const { slug: _slug, content, ...frontmatter } = post;
  const frontmatterEntries = Object.entries(frontmatter).map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}:\n${value.map((item) => `  - ${item}`).join("\n")}`;
    }
    if (typeof value === "object" && value != null) {
      return `${key}: ${JSON.stringify(value)}`;
    }
    if (typeof value === "boolean") {
      return `${key}: ${value}`;
    }
    return `${key}: "${value.toString()}"`;
  });

  return `---\n${frontmatterEntries.join("\n")}\n---\n${content}`;
};

describe("parseBlogPostDate", () => {
  it("returns a Date for valid ISO strings", () => {
    expect(parseBlogPostDate("2024-06-01T00:00:00.000Z")).toEqual(
      new Date("2024-06-01T00:00:00.000Z"),
    );
  });

  it("returns null for missing or invalid dates", () => {
    expect(parseBlogPostDate("")).toBeNull();
    expect(parseBlogPostDate("not-a-date")).toBeNull();
  });
});

describe("getAllPosts", () => {
  beforeEach(() => {
    directoryEntries.length = 0;
    for (const key of Object.keys(fileContents)) {
      delete fileContents[key];
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns posts sorted by date descending", () => {
    const posts: Post[] = [
      {
        slug: "older",
        title: "Older post",
        excerpt: "Older excerpt",
        date: "2024-01-01T00:00:00.000Z",
        category: "Blog",
        content: "Older body",
      },
      {
        slug: "newer",
        title: "Newer post",
        excerpt: "Newer excerpt",
        date: "2024-06-01T00:00:00.000Z",
        category: "Blog",
        content: "Newer body",
      },
    ];

    directoryEntries.push(...posts.map((post) => `${post.slug}.md`));
    for (const post of posts) {
      fileContents[post.slug] = serializePost(post);
    }

    const result = blogPost.getAllPosts(DEFAULT_LOCALE);

    expect(result.map((post) => post.slug)).toEqual(["newer", "older"]);
  });

  it("excludes preview posts from the public index", () => {
    const posts: Post[] = [
      {
        slug: "published",
        title: "Published",
        excerpt: "Published excerpt",
        date: "2024-06-01T00:00:00.000Z",
        category: "Blog",
        content: "Published body",
      },
      {
        slug: "draft",
        title: "Draft",
        excerpt: "Draft excerpt",
        date: "2024-07-01T00:00:00.000Z",
        category: "Blog",
        preview: true,
        content: "Draft body",
      },
    ];

    directoryEntries.push(...posts.map((post) => `${post.slug}.md`));
    for (const post of posts) {
      fileContents[post.slug] = serializePost(post);
    }

    const result = blogPost.getAllPosts(DEFAULT_LOCALE);

    expect(result.map((post) => post.slug)).toEqual(["published"]);
  });
});

describe("postsDirectory locale resolution", () => {
  beforeEach(() => {
    directoryEntries.length = 0;
    for (const key of Object.keys(fileContents)) {
      delete fileContents[key];
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves posts for supported content locales", () => {
    directoryEntries.push("translated-post.md");
    fileContents["translated-post"] = serializePost({
      slug: "translated-post",
      title: "Translated",
      excerpt: "Excerpt",
      date: "2024-06-01T00:00:00.000Z",
      category: "Blog",
      content: "Body",
    });

    const post = blogPost.getPostBySlug("translated-post", "zh-CN");

    expect(post?.title).toBe("Translated");
    expect(vi.mocked(fs.readFileSync).mock.calls[0]?.[0]).toContain("_posts/zh-CN/");
  });
});

describe("getPostBySlug", () => {
  beforeEach(() => {
    directoryEntries.length = 0;
    for (const key of Object.keys(fileContents)) {
      delete fileContents[key];
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the post file is missing", () => {
    expect(blogPost.getPostBySlug("missing-post", DEFAULT_LOCALE)).toBeNull();
  });

  it("returns null for unsafe slugs", () => {
    expect(blogPost.getPostBySlug("../secrets", DEFAULT_LOCALE)).toBeNull();
  });

  it("normalizes YAML date frontmatter to ISO strings", () => {
    directoryEntries.push("dated-post.md");
    fileContents["dated-post"] = `---
title: Dated post
date: 2026-06-19T00:00:00.000Z
excerpt: Dated excerpt
category: Blog
---
Post body`;

    const post = blogPost.getPostBySlug("dated-post", DEFAULT_LOCALE);

    expect(post?.date).toBe("2026-06-19T00:00:00.000Z");
  });
});

describe("getRelevantPosts", () => {
  beforeEach(() => {
    directoryEntries.length = 0;
    for (const key of Object.keys(fileContents)) {
      delete fileContents[key];
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty array when the current post cannot be found", () => {
    const result = blogPost.getRelevantPosts("missing-post", DEFAULT_LOCALE);

    expect(result).toEqual([]);
  });

  it("returns the most relevant posts sorted by score", () => {
    const currentPost: Post = {
      slug: "current",
      title: "Building Mindful Communities",
      excerpt: "Meditation practices for community support",
      date: "2024-04-01T00:00:00.000Z",
      category: "Blog",
      content: "Body",
      tags: ["Mindfulness", "Community"],
    };

    const candidates: Post[] = [
      {
        slug: "high-match",
        title: "Mindfulness Communities in Practice",
        excerpt: "Exploring meditation programs for communities",
        date: "2024-04-05T00:00:00.000Z",
        category: "Blog",
        content: "Body",
        tags: ["mindfulness", "support"],
      },
      {
        slug: "medium-match",
        title: "Community Support Groups",
        excerpt: "How to build support networks for communities",
        date: "2024-04-04T00:00:00.000Z",
        category: "Blog",
        content: "Body",
        tags: ["Community"],
      },
      {
        slug: "keyword-match",
        title: "Meditation Habits for Busy People",
        excerpt: "Meditation practices for stress relief",
        date: "2024-04-03T00:00:00.000Z",
        category: "Blog",
        content: "Body",
        tags: [],
      },
      {
        slug: "low-match",
        title: "Unrelated Topic",
        excerpt: "A completely different subject",
        date: "2024-04-02T00:00:00.000Z",
        category: "Blog",
        content: "Body",
        tags: ["Other"],
      },
    ];

    const allPosts = [currentPost, ...candidates];
    directoryEntries.push(...allPosts.map((post) => `${post.slug}.md`));
    for (const post of allPosts) {
      fileContents[post.slug] = serializePost(post);
    }

    const result = blogPost.getRelevantPosts("current", DEFAULT_LOCALE, 3);

    expect(result).toHaveLength(3);
    expect(result.map((post) => post.slug)).toEqual([
      "medium-match",
      "high-match",
      "keyword-match",
    ]);
  });
});
