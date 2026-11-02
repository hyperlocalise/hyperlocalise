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
import { describe, expect, it } from "vite-plus/test";

import { extractHtmlIngestEntries } from "@/lib/projects/files/html-ingest-entries";

import type { HubspotBlogRecord } from "./client";
import {
  buildBlogPostHtmlDocument,
  buildHubspotBlogFolderPath,
  buildHubspotBlogPostSourcePath,
  hashHubspotBlogImportBundle,
  hubspotBlogSyncSourcePath,
  readBlogPostHtmlDocument,
  shouldImportRssBody,
  splitBlogPostIntoImportFiles,
} from "./blog-post-files";

function samplePost(overrides: Partial<HubspotBlogRecord> = {}): HubspotBlogRecord {
  return {
    id: "post-1",
    name: "Launch",
    language: "en",
    translatedFromId: null,
    htmlTitle: "Launch title",
    metaDescription: "Meta",
    featuredImageAltText: "",
    postBody: "<p>Hello world</p>",
    postSummary: "Summary",
    rssBody: "<p>Hello world</p>",
    rssSummary: "",
    widgets: {},
    layoutSections: {},
    widgetContainers: {},
    templatePath: null,
    attachedStylesheets: [],
    updatedAt: null,
    ...overrides,
  };
}

describe("blog-post-files", () => {
  it("builds a single post.html with email-style sections and template css", () => {
    const html = buildBlogPostHtmlDocument(samplePost(), "article { max-width: 720px; }");
    expect(html).toContain('data-hl-style="hubspot"');
    expect(html).toContain("article { max-width: 720px; }");
    expect(html).toContain('data-hl-field="name"');
    expect(html).toContain('data-hl-field="htmlTitle"');
    expect(html).toContain('data-hl-field="postBody"');
    const tree = readBlogPostHtmlDocument(html);
    expect(tree.name).toBe("Launch");
    expect(tree.htmlTitle).toBe("Launch title");
    expect(tree.postBody).toContain("Hello world");
  });

  it("splitBlogPostIntoImportFiles returns only post.html", () => {
    const files = splitBlogPostIntoImportFiles(samplePost(), "");
    expect(files.map((file) => file.fileName)).toEqual(["post.html"]);
    expect(files[0]?.sourcePath).toBe("hubspot/blog-posts/post-1/post.html");
  });

  it("omits rssBody from post.html when it duplicates visible post body text", () => {
    const html = buildBlogPostHtmlDocument(samplePost(), "");
    expect(html).not.toContain('data-hl-field="rssBody"');
    expect(shouldImportRssBody(samplePost().postBody, samplePost().rssBody)).toBe(false);
  });

  it("includes rssBody when rss text differs from post body", () => {
    const html = buildBlogPostHtmlDocument(samplePost({ rssBody: "<p>Feed-only teaser</p>" }), "");
    expect(html).toContain('data-hl-field="rssBody"');
  });

  it("builds folder and post.html repository paths", () => {
    expect(buildHubspotBlogFolderPath("post-1")).toBe("hubspot/blog-posts/post-1");
    expect(hubspotBlogSyncSourcePath("post-1")).toBe("hubspot/blog-posts/post-1");
    expect(buildHubspotBlogPostSourcePath("post-1")).toBe("hubspot/blog-posts/post-1/post.html");
  });

  it("hashes import bundles in stable path order", () => {
    const files = splitBlogPostIntoImportFiles(
      samplePost({ rssBody: "<p>Feed-only teaser</p>" }),
      "body { margin: 0; }",
    );
    const first = hashHubspotBlogImportBundle(files);
    expect(hashHubspotBlogImportBundle([...files])).toBe(first);
  });

  it("exposes html ingest entries for translatable copy", () => {
    const html = buildBlogPostHtmlDocument(samplePost(), "");
    const entries = extractHtmlIngestEntries(html);
    expect(Object.keys(entries).length).toBeGreaterThan(0);
    expect(Object.values(entries).join(" ")).toContain("Launch title");
    expect(Object.values(entries).join(" ")).toContain("Hello world");
  });
});
