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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import matter from "gray-matter";
import { describe, expect, it } from "vite-plus/test";

import { isValidBlogPostSlug } from "./blog-post-path";
import { markdownToHtml } from "./markdown-to-html";

const SLUG = "how-to-choose-a-continuous-localisation-workflow";

describe("continuous localisation buyer guide", () => {
  const file = readFileSync(join(process.cwd(), `_posts/en/${SLUG}.md`), "utf8");
  const { data, content } = matter(file);

  it("has required frontmatter and a valid slug", () => {
    expect(isValidBlogPostSlug(SLUG)).toBe(true);
    expect(data.title).toBe("How to Choose a Continuous Localisation Workflow");
    expect(data.category).toBe("Product");
    expect(content.length).toBeGreaterThan(8000);
  });

  it("does not rank named competitors", () => {
    expect(content).not.toMatch(/\branks?\s+(first|#1|number one)\b/i);
    expect(content).not.toMatch(/\bour top choice\b/i);
    expect(content).not.toMatch(/\bbest overall\b/i);
    expect(content).not.toMatch(/\bnumber-one\b/i);
  });

  it("renders evaluation criteria and unranked market classes", async () => {
    const html = await markdownToHtml(content);

    expect(html).toContain("Product-context awareness");
    expect(html).toContain("Human-in-the-loop review");
    expect(html).toContain("TMS interoperability");
    expect(html).toContain("Release-readiness signals");
    expect(html).toContain("Legacy TMS");
    expect(html).toContain("Developer-first");
    expect(html).toContain("Agentic layers");
    expect(html).toContain("In-house scripts");
    expect(html).toContain("<table");
    expect(html).toContain("What are the best localisation platforms");
  });
});
