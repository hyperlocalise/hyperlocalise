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

import type { HubspotBlogRecord, HubspotContentClient } from "./client";
import {
  blogDraftFieldsFromPostHtml,
  blogPostPushName,
  hashHubspotBlogPostHtml,
  hashRemoteBlogPostHtml,
  isHubspotBlogBundleSourcePath,
} from "./blog-post-bundle";
import {
  buildBlogPostHtmlDocument,
  hashHubspotBlogImportBundle,
  splitBlogPostIntoImportFiles,
} from "./blog-post-files";
import { hubspotSeedSourceKeys } from "./seed-hubspot-translations";

function samplePost(overrides: Partial<HubspotBlogRecord> = {}): HubspotBlogRecord {
  return {
    id: "post-1",
    name: "Launch",
    language: "en",
    translatedFromId: null,
    htmlTitle: "Launch title",
    metaDescription: "Meta description",
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

describe("blog-post-bundle", () => {
  it("detects blog folder sync paths", () => {
    expect(isHubspotBlogBundleSourcePath("hubspot/blog-posts/post-9")).toBe(true);
    expect(isHubspotBlogBundleSourcePath("hubspot/blog-posts/post-9/post.html")).toBe(false);
  });

  it("derives seed keys from post.html like email html", () => {
    const html = buildBlogPostHtmlDocument(samplePost(), "");
    const keys = hubspotSeedSourceKeys("blog", html);
    const ingestKeys = Object.keys(extractHtmlIngestEntries(html));
    expect(keys.length).toBeGreaterThan(0);
    expect(ingestKeys.every((key) => keys.includes(key))).toBe(true);
  });

  it("hashes post html from document content", () => {
    const post = samplePost({ rssBody: "<p>Feed-only</p>" });
    const html = buildBlogPostHtmlDocument(post, "a{}");
    expect(hashHubspotBlogPostHtml(html)).toBe(hashHubspotBlogPostHtml(html));
    expect(hashHubspotBlogImportBundle(splitBlogPostIntoImportFiles(post, "a{}"))).not.toBe(
      hashHubspotBlogPostHtml(html),
    );
  });

  it("merges approved copy into post.html and builds draft fields for push", () => {
    const post = samplePost();
    const sourceHtml = buildBlogPostHtmlDocument(post, "");
    const postEntries = extractHtmlIngestEntries(sourceHtml);
    const titleKey = Object.entries(postEntries).find(
      ([, text]) => text.trim() === "Launch title",
    )?.[0];
    const postEntry = Object.entries(postEntries).find(([, text]) => text.includes("Hello world"));
    expect(titleKey).toBeTruthy();
    expect(postEntry).toBeTruthy();
    const [ingestKey, sourceSegment] = postEntry!;
    const prefilled = {
      [titleKey!]: "Titre de lancement",
      [ingestKey]: sourceSegment.replace("Hello world", "Bonjour le monde"),
    };
    const draft = blogDraftFieldsFromPostHtml({ live: post, sourceHtml, prefilled });
    expect(draft.htmlTitle).toBe("Titre de lancement");
    expect(draft.postBody).toContain("Bonjour le monde");
    expect(draft.rssBody).toContain("Bonjour le monde");
    expect(draft.metaDescription).toBe("Meta description");
    expect(
      blogPostPushName({
        sourceName: post.name,
        translatedName: draft.name,
        translatedHtmlTitle: draft.htmlTitle,
      }),
    ).toBe("Titre de lancement");
  });

  it("keeps remote copy for unapproved post.html fields instead of source language", () => {
    const source = samplePost();
    const remote = samplePost({
      htmlTitle: "Titre distant",
      metaDescription: "Description distante",
      postBody: "<p>Bonjour le monde</p>",
      postSummary: "Resume distant",
    });
    const sourceHtml = buildBlogPostHtmlDocument(source, "");
    const remoteHtml = buildBlogPostHtmlDocument(remote, "");
    const entries = extractHtmlIngestEntries(sourceHtml);
    const titleKey = Object.entries(entries).find(
      ([, text]) => text.trim() === "Launch title",
    )?.[0];
    expect(titleKey).toBeTruthy();
    const draft = blogDraftFieldsFromPostHtml({
      live: remote,
      sourceHtml,
      remoteHtml,
      prefilled: { [titleKey!]: "Titre approuve" },
    });
    expect(draft.htmlTitle).toBe("Titre approuve");
    expect(draft.metaDescription).toBe("Description distante");
    expect(draft.postBody).toContain("Bonjour le monde");
    expect(draft.postBody).not.toContain("Hello world");
    expect(draft.postSummary).toBe("Resume distant");
  });

  it("uses a translated post name instead of the HTML title", () => {
    const post = samplePost();
    const sourceHtml = buildBlogPostHtmlDocument(post, "");
    const entries = extractHtmlIngestEntries(sourceHtml);
    const nameKey = Object.entries(entries).find(([, text]) => text.trim() === "Launch")?.[0];
    expect(nameKey).toBeTruthy();
    const draft = blogDraftFieldsFromPostHtml({
      live: post,
      sourceHtml,
      prefilled: { [nameKey!]: "Lancement" },
    });
    expect(draft.name).toBe("Lancement");
    expect(
      blogPostPushName({
        sourceName: post.name,
        translatedName: draft.name,
        translatedHtmlTitle: draft.htmlTitle,
      }),
    ).toBe("Lancement");
  });

  it("hashes a remote locale copy the same way as imported post.html", async () => {
    const post = samplePost({ rssBody: "<p>Feed-only</p>" });
    const sourceHtml = buildBlogPostHtmlDocument(post, ".post{margin:0}");
    const sourceHash = hashHubspotBlogPostHtml(sourceHtml);
    const client = {
      getBlogPost: async () => post,
      collectBlogPostStylesCss: async () => ".post{margin:0}",
    } as unknown as HubspotContentClient;
    await expect(hashRemoteBlogPostHtml(client, "copy-post-1")).resolves.toBe(sourceHash);
  });
});
