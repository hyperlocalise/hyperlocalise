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

import type { HubspotContentClient, HubspotPageRecord } from "./client";
import {
  buildHubspotPageSourcePath,
  buildPageHtmlDocument,
  hashHubspotPageHtml,
  hashRemotePageHtml,
  isHubspotPageKind,
  pageDraftFieldsFromHtml,
  readPageHtmlDocument,
  splitPageIntoImportFiles,
} from "./page-files";

function samplePage(overrides: Partial<HubspotPageRecord> = {}): HubspotPageRecord {
  return {
    id: "lp-1",
    name: "Pricing",
    language: "en",
    translatedFromId: null,
    htmlTitle: "Pricing title",
    metaDescription: "Meta",
    featuredImageAltText: "Hero photo",
    widgets: {},
    layoutSections: {
      dnd_area: {
        rows: [
          {
            "0": {
              params: {
                html: "<h2>Book a consultation</h2><section><p>Inner section</p></section>",
              },
            },
          },
        ],
      },
    },
    widgetContainers: {},
    templatePath: null,
    attachedStylesheets: [],
    updatedAt: null,
    dynamicPageHubDbTableId: null,
    ...overrides,
  };
}

describe("page-files", () => {
  it("builds a single page.html with email-style sections and template css", () => {
    const html = buildPageHtmlDocument(samplePage(), "article { max-width: 720px; }");
    expect(html).toContain('data-hl-style="hubspot"');
    expect(html).toContain("article { max-width: 720px; }");
    expect(html).toContain('data-hl-field="htmlTitle"');
    expect(html).toContain('data-hl-field="metaDescription"');
    expect(html).toContain("layoutSections.dnd_area.rows.0.0.params.html");
    const tree = readPageHtmlDocument(html);
    expect(tree.htmlTitle).toBe("Pricing title");
    expect(tree.metaDescription).toBe("Meta");
    expect(JSON.stringify(tree.layoutSections)).toContain("Book a consultation");
    expect(JSON.stringify(tree.layoutSections)).toContain("Inner section");
  });

  it("round-trips nested section html through the envelope", () => {
    const html = buildPageHtmlDocument(samplePage(), "");
    expect(html).toContain("<!--/hl-field-->");
    expect(readPageHtmlDocument(html)).toEqual(readPageHtmlDocument(html));
    expect(JSON.stringify(readPageHtmlDocument(html))).toContain("<section>");
  });

  it("splitPageIntoImportFiles returns only page.html", () => {
    const files = splitPageIntoImportFiles("landing-page", samplePage(), "");
    expect(files.map((file) => file.fileName)).toEqual(["page.html"]);
    expect(files[0]?.sourcePath).toBe("hubspot/landing-pages/lp-1/page.html");
    expect(files[0]?.fileFormat).toBe("html");
  });

  it("builds stable page.html repository paths", () => {
    expect(buildHubspotPageSourcePath("landing-page", "lp-1")).toBe(
      "hubspot/landing-pages/lp-1/page.html",
    );
    expect(buildHubspotPageSourcePath("website-page", "site-2")).toBe(
      "hubspot/website-pages/site-2/page.html",
    );
    expect(isHubspotPageKind("landing-page")).toBe(true);
    expect(isHubspotPageKind("website-page")).toBe(true);
    expect(isHubspotPageKind("blog")).toBe(false);
  });

  it("hashes page html stably", () => {
    const html = buildPageHtmlDocument(samplePage(), "body { margin: 0; }");
    expect(hashHubspotPageHtml(html)).toBe(hashHubspotPageHtml(html));
  });

  it("exposes html ingest entries for translatable copy", () => {
    const html = buildPageHtmlDocument(samplePage(), "");
    const entries = extractHtmlIngestEntries(html);
    expect(Object.keys(entries).length).toBeGreaterThan(0);
    expect(Object.values(entries).join(" ")).toContain("Pricing title");
    expect(Object.values(entries).join(" ")).toContain("Book a consultation");
  });

  it("merges approved copy into page.html and builds draft fields for push", () => {
    const page = samplePage();
    const sourceHtml = buildPageHtmlDocument(page, "");
    const entries = extractHtmlIngestEntries(sourceHtml);
    const titleKey = Object.entries(entries).find(
      ([, text]) => text.trim() === "Pricing title",
    )?.[0];
    const section = Object.entries(entries).find(([, text]) =>
      text.includes("Book a consultation"),
    );
    expect(titleKey).toBeTruthy();
    expect(section).toBeTruthy();
    const [ingestKey, sourceSegment] = section!;
    const draft = pageDraftFieldsFromHtml({
      live: page,
      sourceHtml,
      prefilled: {
        [titleKey!]: "Tarifs",
        [ingestKey]: sourceSegment.replace("Book a consultation", "Réserver une consultation"),
      },
    });
    expect(draft.htmlTitle).toBe("Tarifs");
    expect(JSON.stringify(draft.layoutSections)).toContain("Réserver une consultation");
    expect(JSON.stringify(draft.layoutSections)).toContain("<section>");
    expect(draft.metaDescription).toBe("Meta");
  });

  it("hashes a remote locale copy the same way as imported page.html", async () => {
    const page = samplePage();
    const sourceHtml = buildPageHtmlDocument(page, "article { max-width: 720px; }");
    const client = {
      getLandingPage: async () => page,
      collectPageStylesCss: async () => "article { max-width: 720px; }",
    } as unknown as HubspotContentClient;
    await expect(hashRemotePageHtml(client, "landing-page", "lp-copy")).resolves.toBe(
      hashHubspotPageHtml(sourceHtml),
    );
  });

  it("returns empty html when the page has no copy", () => {
    expect(
      buildPageHtmlDocument(
        samplePage({
          htmlTitle: "",
          metaDescription: "",
          featuredImageAltText: "",
          layoutSections: {},
        }),
        "",
      ),
    ).toBe("");
    expect(
      splitPageIntoImportFiles(
        "website-page",
        samplePage({
          htmlTitle: "",
          metaDescription: "",
          featuredImageAltText: "",
          layoutSections: {},
        }),
        "",
      ),
    ).toEqual([]);
  });
});
