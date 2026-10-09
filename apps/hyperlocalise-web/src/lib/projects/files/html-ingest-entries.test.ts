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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import {
  applyHtmlIngestEntryKeys,
  extractHtmlIngestEntries,
  isHashedHtmlEntryKey,
  legacyHtmlSegmentKey,
  utf8FromStoredFileContent,
} from "./html-ingest-entries";

const formattingFixture = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../../../tests/html/formatting-test.html",
  ),
  "utf8",
);

describe("extractHtmlIngestEntries", () => {
  it("assigns dotted tag-path keys like markdown slots", () => {
    const got = extractHtmlIngestEntries(`<html><head><title>Page Title</title></head><body>
<h1>Welcome</h1>
<p>First</p>
<p>Second</p>
<img alt="A red cat">
<table><tr><th>Name</th><td>Value</td></tr></table>
</body></html>`);

    expect(got).toMatchObject({
      "html.body.h1": "Welcome",
      "html.body.p": "First",
      "html.body.p.2": "Second",
      "html.body.img.alt": "A red cat",
      "html.body.table.tr.th": "Name",
      "html.body.table.tr.td": "Value",
    });
    expect(got["html.head.title"]).toBeUndefined();
  });

  it("extracts the formatting fixture with table and list paths", () => {
    const got = extractHtmlIngestEntries(formattingFixture);
    expect(got["html.body.h1"]).toBe("HTML Formatting Test");
    expect(got["html.body.p"]).toContain("This page tests ");
    expect(got["html.body.p.strong"]).toContain("tables");
    expect(got["html.body.p.strong.2"]).toContain("bullet lists");
    expect(got["html.body.p"]).not.toContain("<strong>");
    expect(got["tables"]).toBeUndefined();
    expect(got["html.body.table.thead.tr.th"]).toBe("ID");
    expect(got["html.body.ul.li"]).toBe("First bullet item");
    expect(got["html.body.ul.li.ul.li"]).toBe("Nested bullet item A");
    expect(Object.keys(got).some((key) => isHashedHtmlEntryKey(key))).toBe(false);
  });

  it("splits inline tags into path keys", () => {
    const got = extractHtmlIngestEntries("<p>Hello <strong>world</strong>!</p>");
    expect(got["html.p"]).toContain("Hello ");
    expect(got["html.p.strong"]).toContain("world");
    expect(got["html.p"]).not.toContain("<strong>");
    expect(got["html.p.strong"]).not.toContain("<strong>");
  });

  it("splits a paragraph with multiple inline tags into path keys", () => {
    const html =
      "<p>This page tests <strong>tables</strong>, <strong>bullet lists</strong>, numbered lists, and basic HTML styling.</p>";
    const got = extractHtmlIngestEntries(html);
    expect(got["html.p"]).toContain("This page tests ");
    expect(got["html.p.strong"]).toContain("tables");
    expect(got["html.p.strong.2"]).toContain("bullet lists");
    expect(got["html.p.2"]).toContain("numbered lists, and basic HTML styling.");
    expect(got["html.p"]).not.toContain("<strong>");
  });
});

describe("utf8FromStoredFileContent", () => {
  it("decodes strings, bytes, and serialized Node buffers without Buffer", () => {
    expect(utf8FromStoredFileContent("<p>Hello</p>")).toBe("<p>Hello</p>");
    expect(utf8FromStoredFileContent(new TextEncoder().encode("<p>Hello</p>"))).toBe(
      "<p>Hello</p>",
    );
    expect(utf8FromStoredFileContent({ type: "Buffer", data: [60, 112, 62] })).toBe("<p>");
  });
});

describe("applyHtmlIngestEntryKeys", () => {
  it("replaces hashed sandbox keys with tag-path keys", () => {
    const html = "<html><body><h1>Welcome</h1><p>Hello world.</p></body></html>";
    const hashedTitle = legacyHtmlSegmentKey("Welcome", new Map());
    const hashedBody = legacyHtmlSegmentKey("Hello world.", new Map());

    expect(
      applyHtmlIngestEntryKeys("pages/home.html", html, {
        [hashedTitle]: "Welcome",
        [hashedBody]: "Hello world.",
      }),
    ).toEqual({
      "html.body.h1": "Welcome",
      "html.body.p": "Hello world.",
    });
  });

  it("leaves non-HTML payloads unchanged", () => {
    expect(applyHtmlIngestEntryKeys("locales/en.json", "{}", { "hello.title": "Hi" })).toEqual({
      "hello.title": "Hi",
    });
  });
});
