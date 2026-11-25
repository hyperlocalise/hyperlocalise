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

export type BlogAuthor = {
  name: string;
  /** Profile that confirms who the author is, used as schema.org `sameAs`. */
  profileUrl: string;
  jobTitle: string;
};

/**
 * Authors a post can name in its `author` frontmatter, for example `author: minh-cung`.
 * Named authors become a schema.org Person on the Article, which answer engines weigh
 * more than a post credited only to the company.
 */
export const BLOG_AUTHORS: Record<string, BlogAuthor> = {
  "minh-cung": {
    name: "Minh Cung",
    profileUrl: "https://www.linkedin.com/in/minhcung/",
    jobTitle: "Co-founder",
  },
  "hans-bui": {
    name: "Hans Bui",
    profileUrl: "https://www.linkedin.com/in/hansbui/",
    jobTitle: "Co-founder",
  },
};

export function getBlogAuthor(key: string | undefined): BlogAuthor | null {
  if (!key) {
    return null;
  }

  return BLOG_AUTHORS[key] ?? null;
}
