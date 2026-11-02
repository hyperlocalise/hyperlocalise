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

import { serializeHubspotDocument } from "./document";
import { buildPageHtmlDocument } from "./page-files";
import {
  hubspotDifferingEntries,
  hubspotSeedHash,
  hubspotSeedSourceKeys,
  isHubspotSeedComplete,
} from "./seed-hubspot-translations";

describe("hubspot seed helpers", () => {
  it("keeps only locale values that differ from the source", () => {
    expect(
      hubspotDifferingEntries(
        { title: "Hello", body: "World" },
        { title: "Bonjour", body: "World", extra: "Supplément" },
      ),
    ).toEqual({ title: "Bonjour" });
  });

  it("ignores blank locale values", () => {
    expect(hubspotDifferingEntries({ title: "Hello" }, { title: "  " })).toEqual({});
  });

  it("hashes entries independent of key order", () => {
    expect(hubspotSeedHash({ a: "1", b: "2" })).toBe(hubspotSeedHash({ b: "2", a: "1" }));
    expect(hubspotSeedHash({ a: "1" })).not.toBe(hubspotSeedHash({ a: "2" }));
  });

  it("requires every source key for a complete seed", () => {
    expect(isHubspotSeedComplete([], { a: "1" })).toBe(false);
    expect(isHubspotSeedComplete(["a", "b"], { a: "1" })).toBe(false);
    expect(isHubspotSeedComplete(["a", "b"], { a: "1", b: "2" })).toBe(true);
  });

  it("lists flattened keys of a stored JSON document", () => {
    const content = serializeHubspotDocument({ title: "Hello", nested: { body: "World" } });
    expect(hubspotSeedSourceKeys("form", content).toSorted()).toEqual(["nested.body", "title"]);
    expect(hubspotSeedSourceKeys("form", "not json")).toEqual([]);
  });

  it("lists html ingest keys for landing and website page.html", () => {
    const html = buildPageHtmlDocument(
      {
        id: "lp-1",
        name: "Pricing",
        language: "en",
        translatedFromId: null,
        htmlTitle: "Pricing title",
        metaDescription: "Meta",
        featuredImageAltText: "",
        widgets: {},
        layoutSections: {
          dnd_area: {
            rows: [{ "0": { params: { html: "<p>Book a consultation</p>" } } }],
          },
        },
        widgetContainers: {},
        templatePath: null,
        attachedStylesheets: [],
        updatedAt: null,
        dynamicPageHubDbTableId: null,
      },
      "",
    );
    const keys = hubspotSeedSourceKeys("landing-page", html);
    const ingestKeys = Object.keys(extractHtmlIngestEntries(html));
    expect(keys.length).toBeGreaterThan(0);
    expect(ingestKeys.every((key) => keys.includes(key))).toBe(true);
    expect(hubspotSeedSourceKeys("website-page", html)).toEqual(keys);
  });
});
